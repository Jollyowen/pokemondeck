import "server-only";
import type { Card } from "@/types/card";
import type { Deck, DeckValidationResult } from "@/types/deck";
import { resolveDeckCards } from "@/lib/deck/resolve-cards";
import { computeDeckValidation } from "@/lib/deck/validate";
import { updateOwnedDeck } from "@/lib/deck/repository";

export type DeckWithValidation = {
  deck: Deck;
  resolvedCards: Record<string, Card>;
  validation: DeckValidationResult;
};

/**
 * Resolves card data, computes validation, and persists the resulting
 * status if it differs from what's stored — so `decks.status` always
 * reflects the last computed validation without every caller having to
 * remember to write it back.
 */
export async function validateAndPersistStatus(
  deck: Deck,
  ownerId: string,
): Promise<DeckWithValidation> {
  const { cardsById, missingCardIds } = await resolveDeckCards(deck.cards);
  const validation = computeDeckValidation(deck.cards, cardsById, missingCardIds, deck.format);

  let finalDeck = deck;
  if (validation.status !== deck.status) {
    const updated = await updateOwnedDeck(deck.id, ownerId, { status: validation.status });
    if (updated) finalDeck = updated;
  }

  return { deck: finalDeck, resolvedCards: cardsById, validation };
}
