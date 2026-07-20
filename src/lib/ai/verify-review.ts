import type { Card, DeckFormat } from "@/types/card";
import type { DeckCardEntry, DeckReviewResult } from "@/types/deck";
import type { RawDeckReviewResult } from "@/lib/ai/review-schema";
import { computeDeckValidation } from "@/lib/deck/validate";

function simulateSwap(
  entries: DeckCardEntry[],
  remove: Array<{ cardId: string; count: number }>,
  add: Array<{ cardId: string; count: number }>,
  candidateCardsById: Record<string, Card>,
): DeckCardEntry[] | null {
  const byId = new Map(entries.map((e) => [e.cardId, { ...e }]));

  for (const r of remove) {
    const existing = byId.get(r.cardId);
    if (!existing || existing.quantity < r.count) return null; // can't remove more than present
    existing.quantity -= r.count;
    if (existing.quantity === 0) byId.delete(r.cardId);
  }

  for (const a of add) {
    const candidate = candidateCardsById[a.cardId];
    if (!candidate) return null; // add references a card outside the supplied candidate set
    const existing = byId.get(a.cardId);
    if (existing) {
      existing.quantity += a.count;
    } else {
      byId.set(a.cardId, { cardId: a.cardId, cardName: candidate.name, quantity: a.count });
    }
  }

  return [...byId.values()];
}

function isValidSwap(
  swap: RawDeckReviewResult["suggestedSwaps"][number],
  deckEntries: DeckCardEntry[],
  deckCardIds: Set<string>,
  candidateCardsById: Record<string, Card>,
  allCardsById: Record<string, Card>,
  format: DeckFormat,
): boolean {
  // Step 5: every referenced card ID must be real and in the permitted set.
  if (swap.remove.some((r) => !deckCardIds.has(r.cardId))) return false;
  if (swap.add.some((a) => !candidateCardsById[a.cardId])) return false;

  // Step 10: an added card must be legal in the selected format.
  if (format !== "all") {
    for (const a of swap.add) {
      const card = candidateCardsById[a.cardId];
      if (!card || card.legalities[format] !== "legal") return false;
    }
  }

  // Step 7: simulate the swap.
  const resultingEntries = simulateSwap(deckEntries, swap.remove, swap.add, candidateCardsById);
  if (!resultingEntries) return false; // step 6: quantity checks failed during simulation

  // Step 8: total must remain exactly 60.
  const totalCount = resultingEntries.reduce((s, e) => s + e.quantity, 0);
  if (totalCount !== 60) return false;

  // Step 9: must not violate a copy limit as a result of the added cards.
  const addedCardIds = new Set(swap.add.map((a) => a.cardId));
  const resultingCardsById = { ...allCardsById, ...candidateCardsById };
  const validation = computeDeckValidation(resultingEntries, resultingCardsById, [], format);
  const introducesCopyLimitIssue = validation.issues.some(
    (issue) =>
      (issue.code === "COPY_LIMIT_EXCEEDED" || issue.code === "SPECIAL_COPY_LIMIT_EXCEEDED") &&
      issue.cardIds?.some((id) => addedCardIds.has(id)),
  );
  if (introducesCopyLimitIssue) return false;

  return true;
}

/**
 * Filters a raw (schema-valid but not yet trust-verified) model result down
 * to only the swap suggestions that survive full verification, and strips
 * any evidence card IDs that don't correspond to a real card the model was
 * actually given. Nothing here mutates the deck — verification only
 * decides what's safe to *show* as a suggestion.
 */
export function verifyReviewResult(
  raw: RawDeckReviewResult,
  deckEntries: DeckCardEntry[],
  deckCardsById: Record<string, Card>,
  candidateCardsById: Record<string, Card>,
  format: DeckFormat,
): DeckReviewResult {
  const deckCardIds = new Set(deckEntries.map((e) => e.cardId));
  const allCardsById = { ...deckCardsById, ...candidateCardsById };
  const knownCardIds = new Set(Object.keys(allCardsById));

  const filterEvidence = (ids: string[]) => ids.filter((id) => knownCardIds.has(id));

  return {
    summary: raw.summary,
    strengths: raw.strengths.map((s) => ({ ...s, evidenceCardIds: filterEvidence(s.evidenceCardIds) })),
    issues: raw.issues.map((i) => ({ ...i, evidenceCardIds: filterEvidence(i.evidenceCardIds) })),
    suggestedSwaps: raw.suggestedSwaps.filter((swap) =>
      isValidSwap(swap, deckEntries, deckCardIds, candidateCardsById, allCardsById, format),
    ),
    confidence: raw.confidence,
    limitations: raw.limitations,
  };
}
