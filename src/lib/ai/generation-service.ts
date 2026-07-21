import "server-only";
import { getServerEnv } from "@/lib/env";
import type { DeckFormat } from "@/types/card";
import type { Deck, DeckGenerationResult, StrategyArchetype } from "@/types/deck";
import { gatherDeckGenerationCandidates } from "@/lib/ai/candidate-cards";
import { toDeckReviewCard } from "@/lib/deck/review-cards";
import { buildCandidatePoolSummary } from "@/lib/ai/candidate-pool-summary";
import { getDeckGenerationProvider } from "@/lib/ai/provider-factory";
import { buildVerifiedGeneratedDeck, ensureEvolutionPrerequisites } from "@/lib/ai/verify-generation";
import { computeDeckStatistics } from "@/lib/deck/statistics";
import { computeDeckQuality } from "@/lib/ai/deck-quality";
import { createDeck, updateOwnedDeck } from "@/lib/deck/repository";
import { validateAndPersistStatus, type DeckWithValidation } from "@/lib/deck/service";
import { countGenerationsInLast24Hours, recordGeneration } from "@/lib/ai/generation-repository";
import { AiProviderError, GenerationRateLimitError } from "@/lib/ai/errors";
import { reportError } from "@/lib/monitoring/report-error";
import type { DeckCardEntry } from "@/types/deck";

export class PokemonNotFoundError extends Error {
  constructor(pokemonName: string) {
    super(
      `Couldn't find a Pokémon card named "${pokemonName}" in the catalogue. Check the spelling, or pick a suggestion.`,
    );
    this.name = "PokemonNotFoundError";
  }
}

export type GenerateDeckInput = {
  format: DeckFormat;
  strategyArchetype: StrategyArchetype | null;
  pokemonName: string;
  strategyNotes: string | null;
};

/** Wraps a provider call with the shared error-reporting/mapping used by both the plan and compile stages. */
async function callProvider<T>(label: string, ownerId: string, fn: () => Promise<T>): Promise<T> {
  const env = getServerEnv();
  try {
    return await fn();
  } catch (error) {
    reportError(`AI deck generation: ${label} failed`, error, { provider: env.AI_PROVIDER, ownerId });
    if (error instanceof Error && error.name === "AiReviewOutputError") throw error;
    throw new AiProviderError("The AI deck generation service is temporarily unavailable. Please try again shortly.");
  }
}

export async function generateDeck(
  input: GenerateDeckInput,
  ownerId: string,
): Promise<DeckWithValidation & { explanation: string }> {
  const env = getServerEnv();

  const recentCount = await countGenerationsInLast24Hours(ownerId);
  if (recentCount >= env.AI_DECK_GENERATION_LIMIT_PER_DAY) {
    throw new GenerationRateLimitError(env.AI_DECK_GENERATION_LIMIT_PER_DAY);
  }

  const { targetCard, candidates, targetLegalInFormat } = await gatherDeckGenerationCandidates(
    input.pokemonName,
    input.format,
  );
  if (!targetCard) {
    throw new PokemonNotFoundError(input.pokemonName);
  }
  const target = targetCard; // re-bound so nested closures below see it as non-null

  const targetPrintingIds = new Set(candidates.filter((c) => c.name === target.name).map((c) => c.id));
  console.log("AI deck generation: candidate pool gathered", {
    pokemonName: input.pokemonName,
    resolvedTargetName: target.name,
    targetLegalInFormat,
    targetPrintingsInPool: targetPrintingIds.size,
    totalCandidates: candidates.length,
  });

  const candidatesById = Object.fromEntries(candidates.map((c) => [c.id, c]));
  const candidateReviewCards = candidates.map((c) => toDeckReviewCard(c, 0, input.format));
  const provider = getDeckGenerationProvider();

  // --- Stage 1: strategy plan ---
  const poolSummary = buildCandidatePoolSummary(candidates, target);
  const plan = await callProvider("planning", ownerId, () =>
    provider.planDeck({
      format: input.format,
      strategyArchetype: input.strategyArchetype,
      pokemonName: target.name,
      strategyNotes: input.strategyNotes,
      poolSummary,
    }),
  );

  // --- Stage 2: compile the plan into an actual decklist ---
  async function compile(refinement?: {
    previousCards: Array<{ cardId: string; count: number }>;
    feedback: string[];
  }): Promise<DeckGenerationResult> {
    return callProvider(refinement ? "refinement" : "compilation", ownerId, () =>
      provider.generateDeck({
        format: input.format,
        strategyArchetype: input.strategyArchetype,
        pokemonName: target.name,
        strategyNotes: input.strategyNotes,
        candidateCards: candidateReviewCards,
        plan,
        refinement,
      }),
    );
  }

  function verify(raw: DeckGenerationResult): DeckCardEntry[] {
    return ensureEvolutionPrerequisites(buildVerifiedGeneratedDeck(raw.cards, candidatesById), candidatesById);
  }

  let raw = await compile();
  let verifiedCards = verify(raw);

  // --- Stage 3: deterministic quality scoring ---
  let statistics = computeDeckStatistics(verifiedCards, candidatesById, input.format);
  let quality = computeDeckQuality(verifiedCards, candidatesById, statistics, input.strategyArchetype, input.format);

  console.log("AI deck generation: initial quality check", {
    pokemonName: input.pokemonName,
    passesHardChecks: quality.passesHardChecks,
    hardIssueCount: quality.issues.filter((i) => i.severity === "hard").length,
  });

  // --- Stage 4: one bounded refinement pass if hard checks failed ---
  if (!quality.passesHardChecks) {
    const feedback = quality.issues.filter((i) => i.severity === "hard").map((i) => i.message);
    const refinedRaw = await compile({ previousCards: raw.cards, feedback });
    const refinedVerified = verify(refinedRaw);
    const refinedStatistics = computeDeckStatistics(refinedVerified, candidatesById, input.format);
    const refinedQuality = computeDeckQuality(
      refinedVerified,
      candidatesById,
      refinedStatistics,
      input.strategyArchetype,
      input.format,
    );

    console.log("AI deck generation: post-refinement quality check", {
      pokemonName: input.pokemonName,
      passesHardChecks: refinedQuality.passesHardChecks,
      hardIssueCount: refinedQuality.issues.filter((i) => i.severity === "hard").length,
    });

    // Take the refined attempt regardless of whether it fully passes —
    // never discard a deck the person is waiting on, and a single
    // refinement pass that only partially helps is still an improvement
    // worth keeping over the un-refined original.
    raw = refinedRaw;
    verifiedCards = refinedVerified;
    statistics = refinedStatistics;
    quality = refinedQuality;
  }

  // --- Save regardless of final quality outcome; issues are surfaced live in the editor, never hidden. ---
  const deckName = raw.deckName.trim() || `${target.name} deck`;
  const created = await createDeck(ownerId, deckName, input.format);
  const updated = await updateOwnedDeck(created.id, ownerId, {
    cards: verifiedCards,
    strategyArchetype: input.strategyArchetype,
    strategyNotes: input.strategyNotes,
  });

  await recordGeneration(ownerId);

  const finalDeck: Deck = updated ?? created;
  const result = await validateAndPersistStatus(finalDeck, ownerId);

  const explanationParts = [plan.justification, raw.explanation];
  if (!targetLegalInFormat) {
    explanationParts.unshift(
      `Note: "${target.name}" has no printing legal in the ${input.format} format, so it (and this deck) may include cards flagged as not legal below — consider a different format if that matters for this deck.`,
    );
  }

  return { ...result, explanation: explanationParts.join(" ") };
}
