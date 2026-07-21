import "server-only";
import { getServerEnv } from "@/lib/env";
import type { Deck, DeckReviewResult } from "@/types/deck";
import type { Card as CardType } from "@/types/card";
import { resolveDeckCards } from "@/lib/deck/resolve-cards";
import { computeDeckStatistics } from "@/lib/deck/statistics";
import { computeDeckReviewHash } from "@/lib/deck/review-hash";
import { toDeckReviewCard } from "@/lib/deck/review-cards";
import { gatherCandidateCards } from "@/lib/ai/candidate-cards";
import { getDeckReviewProvider } from "@/lib/ai/provider-factory";
import { verifyReviewResult } from "@/lib/ai/verify-review";
import { REVIEW_PROMPT_VERSION } from "@/lib/ai/prompt";
import { collectReferencedCardIds } from "@/lib/ai/collect-referenced-cards";
import { reportError } from "@/lib/monitoring/report-error";
import {
  findCachedReview,
  saveReview,
  countReviewsInLast24Hours,
  findLatestReview,
  type StoredDeckReview,
} from "@/lib/ai/review-repository";
import { AiProviderError, ReviewRateLimitError } from "@/lib/ai/errors";
import type { DeckCardEntry } from "@/types/deck";

export type ReviewOutcome = {
  result: DeckReviewResult;
  resolvedCards: Record<string, CardType>;
  cached: boolean;
  createdAt: string;
};

/**
 * Resolves full card data for every card referenced anywhere in a review
 * result (strengths/issues evidence, suggested swap remove/add) plus the
 * deck's own cards, so the client can render names and images instead of
 * bare IDs — this is what the review response actually ships to the
 * browser, not just the raw result.
 */
async function resolveResultCards(
  result: DeckReviewResult,
  deckEntries: DeckCardEntry[],
): Promise<Record<string, CardType>> {
  const ids = collectReferencedCardIds(result, deckEntries);
  const { cardsById } = await resolveDeckCards(
    ids.map((id) => ({ cardId: id, cardName: "", quantity: 1 })),
  );
  return cardsById;
}

export async function getOrGenerateReview(deck: Deck, ownerId: string): Promise<ReviewOutcome> {
  const deckHash = computeDeckReviewHash(deck.cards, deck.format, deck.strategyArchetype, deck.strategyNotes);

  const cached = await findCachedReview(deck.id, deckHash);
  if (cached) {
    const resolvedCards = await resolveResultCards(cached.result, deck.cards);
    return { result: cached.result, resolvedCards, cached: true, createdAt: cached.createdAt };
  }

  const env = getServerEnv();
  const recentCount = await countReviewsInLast24Hours(ownerId);
  if (recentCount >= env.AI_REVIEW_LIMIT_PER_DAY) {
    throw new ReviewRateLimitError(env.AI_REVIEW_LIMIT_PER_DAY);
  }

  const { cardsById, missingCardIds } = await resolveDeckCards(deck.cards);
  const statistics = computeDeckStatistics(deck.cards, cardsById, deck.format);
  const candidates = await gatherCandidateCards(deck.cards, cardsById, statistics, deck.format);
  const candidatesById = Object.fromEntries(candidates.map((c) => [c.id, c]));

  const deckReviewCards = deck.cards
    .filter((e) => !missingCardIds.includes(e.cardId))
    .map((e) => {
      const card = cardsById[e.cardId];
      return card ? toDeckReviewCard(card, e.quantity, deck.format) : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const candidateReviewCards = candidates.map((c) => toDeckReviewCard(c, 0, deck.format));

  const provider = getDeckReviewProvider();

  let rawResult: DeckReviewResult;
  try {
    rawResult = await provider.reviewDeck({
      format: deck.format,
      cards: deckReviewCards,
      candidateCards: candidateReviewCards,
      strategyArchetype: deck.strategyArchetype,
      strategyNotes: deck.strategyNotes,
    });
  } catch (error) {
    // Log without owner cookies, secrets, or deck names — just enough to debug.
    reportError("AI provider call failed", error, { provider: env.AI_PROVIDER, deckId: deck.id });
    if (error instanceof Error && error.name === "AiReviewOutputError") throw error;
    throw new AiProviderError("The AI review service is temporarily unavailable. Please try again shortly.");
  }

  const verified = verifyReviewResult(rawResult, deck.cards, cardsById, candidatesById, deck.format);

  const stored = await saveReview({
    deckId: deck.id,
    ownerId,
    deckHash,
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    promptVersion: REVIEW_PROMPT_VERSION,
    result: verified,
  });

  // Deck cards + candidate cards together already cover everything the
  // verified result can reference (verify-review only keeps swaps/evidence
  // that point into one of those two sets), so this is a cheap merge
  // rather than a second resolution pass.
  const resolvedCards = { ...cardsById, ...candidatesById };

  return { result: verified, resolvedCards, cached: false, createdAt: stored.createdAt };
}

export type LatestReviewOutcome = {
  review: StoredDeckReview;
  resolvedCards: Record<string, CardType>;
  isStale: boolean;
} | null;

/** For the "latest review" endpoint: returns the most recent review plus whether the deck has changed since. */
export async function getLatestReviewWithStaleness(deck: Deck): Promise<LatestReviewOutcome> {
  const latest = await findLatestReview(deck.id);
  if (!latest) return null;

  const currentHash = computeDeckReviewHash(deck.cards, deck.format, deck.strategyArchetype, deck.strategyNotes);
  const resolvedCards = await resolveResultCards(latest.result, deck.cards);
  return { review: latest, resolvedCards, isStale: latest.deckHash !== currentHash };
}
