import "server-only";
import { getServerEnv } from "@/lib/env";
import type { DeckFormat } from "@/types/card";
import type { Deck, DeckGenerationResult, StrategyArchetype } from "@/types/deck";
import { gatherDeckGenerationCandidates } from "@/lib/ai/candidate-cards";
import { getArchetypeProfile } from "@/lib/ai/archetype-profiles";
import { getEvolutionLineNames } from "@/lib/deck/evolution-line";
import { toDeckReviewCard } from "@/lib/deck/review-cards";
import { buildCandidatePoolSummary } from "@/lib/ai/candidate-pool-summary";
import { getDeckGenerationProvider } from "@/lib/ai/provider-factory";
import { buildVerifiedGeneratedDeck, ensureEvolutionPrerequisites, topUpExistingCardsToSixty } from "@/lib/ai/verify-generation";
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

export class PokemonNotLegalInFormatError extends Error {
  constructor(pokemonName: string, format: DeckFormat) {
    super(
      `"${pokemonName}" has no printing legal in the ${format} format, so a ${format} deck can't be generated around it. Try a different format, or a different Pokémon.`,
    );
    this.name = "PokemonNotLegalInFormatError";
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

  const { targetCard, candidates, foundButIllegal, diagnostics } = await gatherDeckGenerationCandidates(
    input.pokemonName,
    input.format,
  );
  if (!targetCard) {
    if (foundButIllegal) {
      throw new PokemonNotLegalInFormatError(input.pokemonName, input.format);
    }
    throw new PokemonNotFoundError(input.pokemonName);
  }
  const target = targetCard; // re-bound so nested closures below see it as non-null

  const targetPrintingIds = new Set(candidates.filter((c) => c.name === target.name).map((c) => c.id));
  console.log("AI deck generation: candidate pool gathered", {
    pokemonName: input.pokemonName,
    resolvedTargetName: target.name,
    targetPrintingsInPool: targetPrintingIds.size,
    totalCandidates: candidates.length,
    // targetTypes empty would silently zero out two whole gathering
    // steps (same-type Pokémon, matching Basic Energy) with no error at
    // all — worth seeing directly rather than inferring it from a low
    // total. evolutionLineNames similarly confirms whether the evolution-
    // line step even had anything to search for in the first place.
    targetTypes: target.types,
    evolutionLineNames: getEvolutionLineNames(target),
    // Distinguishes "a bug is dropping real matches" from "this
    // environment's local card database genuinely has little data in
    // it" — both look like a thin candidate pool from the outside, but
    // need completely different fixes. A pool this thin with several
    // staples missed and low counts everywhere points at the database;
    // a normal bySupertype spread with an empty staplesMissed pointing
    // at something more specific to this particular Pokémon/format.
    candidatesBySupertype: diagnostics.bySupertype,
    staplesMissed: diagnostics.staplesMissed,
    staplesFoundButIllegal: diagnostics.staplesFoundButIllegal,
    totalStaplesSearched: diagnostics.totalStaplesSearched,
    roleBasedTrainersFound: diagnostics.roleBasedTrainersFound,
    roleBasedDrawNames: diagnostics.roleBasedDrawNames,
    roleBasedSearchNames: diagnostics.roleBasedSearchNames,
    roleBasedOtherNames: diagnostics.roleBasedOtherNames,
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
    const profile = getArchetypeProfile(input.strategyArchetype);
    return ensureEvolutionPrerequisites(
      buildVerifiedGeneratedDeck(raw.cards, candidatesById, {
        maxEnergyCount: profile.energyRange[1],
        maxPokemonCount: profile.pokemonRange[1],
        maxTrainerCount: profile.trainerRange[1],
      }),
      candidatesById,
    );
  }

  let raw = await compile();
  let verifiedCards = verify(raw);

  // Distinguishes two very different failure shapes that look identical
  // from the final totals alone: the model's raw output already being
  // short of 60, vs. the model genuinely proposing 60 but
  // buildVerifiedGeneratedDeck silently dropping some entries (a
  // hallucinated/invalid cardId, an invalid count). A real report had
  // the model's own explanation claim "sums to exactly 60" while the
  // verified deck landed at 52 — this is what would have told us
  // immediately which of those two it actually was, instead of guessing.
  const rawCardCount = raw.cards.reduce((sum, c) => sum + (Number.isFinite(c.count) ? Math.floor(c.count) : 0), 0);
  const verifiedCardCount = verifiedCards.reduce((sum, e) => sum + e.quantity, 0);
  const droppedCardIds = raw.cards.filter((c) => !candidatesById[c.cardId]).map((c) => c.cardId);
  console.log("AI deck generation: raw vs verified card count", {
    pokemonName: input.pokemonName,
    rawEntryCount: raw.cards.length,
    rawCardCount,
    verifiedCardCount,
    // Non-empty here means the model referenced a cardId that isn't
    // actually in candidateCards — a real, checkable hallucination, not
    // a rate-limiting or under-generation issue.
    droppedCardIds,
  });

  // --- Stage 3: deterministic quality scoring ---
  let statistics = computeDeckStatistics(verifiedCards, candidatesById, input.format);
  let quality = computeDeckQuality(verifiedCards, candidatesById, statistics, input.strategyArchetype, input.format);

  console.log("AI deck generation: initial quality check", {
    pokemonName: input.pokemonName,
    passesHardChecks: quality.passesHardChecks,
    hardIssueCount: quality.issues.filter((i) => i.severity === "hard").length,
    // Full issue detail, not just a count — a count alone can't show
    // whether a refinement pass actually fixed the thing it was given
    // feedback about, or traded one problem for a different one.
    hardIssues: quality.issues.filter((i) => i.severity === "hard").map((i) => ({ code: i.code, message: i.message })),
    totals: {
      pokemon: statistics.totalPokemon,
      trainer: statistics.totalTrainer,
      energy: statistics.totalEnergy,
      draw: statistics.drawSupportCount,
      search: statistics.searchSupportCount,
    },
  });

  // --- Stage 4: one bounded refinement pass if hard checks failed ---
  if (!quality.passesHardChecks) {
    const feedback = quality.issues.filter((i) => i.severity === "hard").map((i) => i.message);
    const refinedRaw = await compile({ previousCards: raw.cards, feedback });
    const refinedVerified = verify(refinedRaw);

    const refinedRawCardCount = refinedRaw.cards.reduce(
      (sum, c) => sum + (Number.isFinite(c.count) ? Math.floor(c.count) : 0),
      0,
    );
    const refinedVerifiedCardCount = refinedVerified.reduce((sum, e) => sum + e.quantity, 0);
    const refinedDroppedCardIds = refinedRaw.cards.filter((c) => !candidatesById[c.cardId]).map((c) => c.cardId);
    console.log("AI deck generation: refinement raw vs verified card count", {
      pokemonName: input.pokemonName,
      rawEntryCount: refinedRaw.cards.length,
      rawCardCount: refinedRawCardCount,
      verifiedCardCount: refinedVerifiedCardCount,
      droppedCardIds: refinedDroppedCardIds,
    });

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
      hardIssues: refinedQuality.issues
        .filter((i) => i.severity === "hard")
        .map((i) => ({ code: i.code, message: i.message })),
      totals: {
        pokemon: refinedStatistics.totalPokemon,
        trainer: refinedStatistics.totalTrainer,
        energy: refinedStatistics.totalEnergy,
        draw: refinedStatistics.drawSupportCount,
        search: refinedStatistics.searchSupportCount,
      },
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

  // --- Stage 5: deterministic top-up to exactly 60, if still short ---
  // Only reached after the single bounded refinement pass above has
  // already run (or wasn't needed) — this never substitutes for asking
  // the model to do better, it only guarantees the structural 60-card
  // requirement the same way copy limits and evolution prerequisites are
  // already guaranteed, using nothing but cards the model itself chose.
  const totalBeforeTopUp = verifiedCards.reduce((sum, e) => sum + e.quantity, 0);
  if (totalBeforeTopUp < 60) {
    const profile = getArchetypeProfile(input.strategyArchetype);
    verifiedCards = topUpExistingCardsToSixty(verifiedCards, candidatesById, {
      pokemon: profile.pokemonRange,
      trainer: profile.trainerRange,
      energy: profile.energyRange,
    });
    const totalAfterTopUp = verifiedCards.reduce((sum, e) => sum + e.quantity, 0);
    statistics = computeDeckStatistics(verifiedCards, candidatesById, input.format);
    quality = computeDeckQuality(verifiedCards, candidatesById, statistics, input.strategyArchetype, input.format);
    console.log("AI deck generation: deterministic top-up", {
      pokemonName: input.pokemonName,
      totalBeforeTopUp,
      totalAfterTopUp,
      reachedSixty: totalAfterTopUp >= 60,
      finalHardIssueCount: quality.issues.filter((i) => i.severity === "hard").length,
    });
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

  // Every candidate offered to the model is now hard-filtered to be legal
  // in the requested format (see gatherDeckGenerationCandidates), so
  // there's no longer a "may include illegal cards" caveat to surface
  // here — a generated deck is either fully format-legal, or generation
  // fails fast with PokemonNotLegalInFormatError before any AI call happens.
  const explanationParts = [plan.justification, raw.explanation];

  return { ...result, explanation: explanationParts.join(" ") };
}
