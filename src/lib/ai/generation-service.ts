import "server-only";
import { getServerEnv } from "@/lib/env";
import type { DeckFormat } from "@/types/card";
import type { Deck, StrategyArchetype } from "@/types/deck";
import { gatherDeckGenerationCandidates } from "@/lib/ai/candidate-cards";
import { toDeckReviewCard } from "@/lib/deck/review-cards";
import { getDeckGenerationProvider } from "@/lib/ai/provider-factory";
import { buildVerifiedGeneratedDeck, ensureEvolutionPrerequisites } from "@/lib/ai/verify-generation";
import { createDeck, updateOwnedDeck } from "@/lib/deck/repository";
import { validateAndPersistStatus, type DeckWithValidation } from "@/lib/deck/service";
import { countGenerationsInLast24Hours, recordGeneration } from "@/lib/ai/generation-repository";
import { AiProviderError, GenerationRateLimitError } from "@/lib/ai/errors";
import { reportError } from "@/lib/monitoring/report-error";

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

  const targetPrintingIds = new Set(candidates.filter((c) => c.name === targetCard.name).map((c) => c.id));
  console.log("AI deck generation: candidate pool gathered", {
    pokemonName: input.pokemonName,
    resolvedTargetName: targetCard.name,
    targetLegalInFormat,
    targetPrintingsInPool: targetPrintingIds.size,
    totalCandidates: candidates.length,
  });

  const candidatesById = Object.fromEntries(candidates.map((c) => [c.id, c]));
  const candidateReviewCards = candidates.map((c) => toDeckReviewCard(c, 0, input.format));

  const provider = getDeckGenerationProvider();

  let raw;
  try {
    raw = await provider.generateDeck({
      format: input.format,
      strategyArchetype: input.strategyArchetype,
      pokemonName: targetCard.name,
      strategyNotes: input.strategyNotes,
      candidateCards: candidateReviewCards,
    });
  } catch (error) {
    reportError("AI deck generation provider call failed", error, {
      provider: env.AI_PROVIDER,
      ownerId,
    });
    if (error instanceof Error && error.name === "AiReviewOutputError") throw error;
    throw new AiProviderError("The AI deck generation service is temporarily unavailable. Please try again shortly.");
  }

  const verifiedCards = ensureEvolutionPrerequisites(
    buildVerifiedGeneratedDeck(raw.cards, candidatesById),
    candidatesById,
  );

  const targetIncludedInFinalDeck = verifiedCards.some((e) => targetPrintingIds.has(e.cardId));
  console.log("AI deck generation: final deck built", {
    pokemonName: input.pokemonName,
    targetIncludedInFinalDeck,
    totalCardsInDeck: verifiedCards.reduce((s, e) => s + e.quantity, 0),
    uniqueCardsInDeck: verifiedCards.length,
  });

  const deckName = raw.deckName.trim() || `${targetCard.name} deck`;
  const created = await createDeck(ownerId, deckName, input.format);
  const updated = await updateOwnedDeck(created.id, ownerId, {
    cards: verifiedCards,
    strategyArchetype: input.strategyArchetype,
    strategyNotes: input.strategyNotes,
  });

  await recordGeneration(ownerId);

  const finalDeck: Deck = updated ?? created;
  const result = await validateAndPersistStatus(finalDeck, ownerId);

  const explanation = targetLegalInFormat
    ? raw.explanation
    : `Note: "${targetCard.name}" has no printing legal in the ${input.format} format, so it (and this deck) may include cards flagged as not legal below — consider a different format if that matters for this deck. ${raw.explanation}`;

  return { ...result, explanation };
}
