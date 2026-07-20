import type { Card } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";

export type EstimatedDeckValue = {
  total: number;
  currency: "USD";
  /** Number of deck entries whose card has no price data, so the total is known to be incomplete. */
  missingPriceCount: number;
};

export function computeEstimatedDeckValue(
  entries: DeckCardEntry[],
  cardsById: Record<string, Card>,
): EstimatedDeckValue | null {
  let total = 0;
  let missingPriceCount = 0;
  let anyPriced = false;

  for (const entry of entries) {
    const card = cardsById[entry.cardId];
    if (!card || card.price?.market == null) {
      missingPriceCount += 1;
      continue;
    }
    anyPriced = true;
    total += card.price.market * entry.quantity;
  }

  if (!anyPriced) return null;

  return { total, currency: "USD", missingPriceCount };
}
