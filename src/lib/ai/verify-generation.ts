import type { Card } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";
import { normalizeCardName } from "@/lib/deck/normalize-name";
import { isBasicEnergy, getSpecialSameNameCopyLimit } from "@/lib/deck/validate";

const DECK_SIZE = 60;
const DEFAULT_COPY_LIMIT = 4;

export type RawGeneratedCard = { cardId: string; count: number };

/**
 * Builds a verified deck card list from raw AI output, deterministically
 * enforcing the same rules a human deck-builder is bound by — never by
 * trusting the model to have gotten them right.
 *
 * - Any card ID not present in candidatesById (a hallucination, or a
 *   reference to something outside the supplied candidate pool) is
 *   dropped entirely, not substituted with a guess.
 * - Copy limits are enforced by construction: quantities are capped
 *   per normalised name group as they're processed, using the same
 *   Basic-Energy exemption and special-same-name-limit detection as the
 *   deck validator, so a model that ignores the 4-copy rule simply can't
 *   produce a deck that violates it.
 * - The 60-card cap is enforced the same way: once the running total
 *   reaches 60, nothing further is added, and a card that would overshoot
 *   the cap is truncated to fit rather than rejected outright (so a model
 *   that gets the total slightly wrong doesn't lose an otherwise-valid
 *   card entirely).
 * - Never pads a short result up to 60 with anything the model didn't
 *   actually choose — a deck under 60 stays under 60, verified as a
 *   draft, rather than silently topped up with invented filler.
 */
export function buildVerifiedGeneratedDeck(
  rawCards: RawGeneratedCard[],
  candidatesById: Record<string, Card>,
): DeckCardEntry[] {
  const nameGroupTotals = new Map<string, number>();
  const result: DeckCardEntry[] = [];
  let totalCount = 0;

  for (const item of rawCards) {
    if (totalCount >= DECK_SIZE) break;

    const card = candidatesById[item.cardId];
    if (!card) continue; // hallucinated or out-of-pool card ID — dropped, never guessed at

    let count = Math.floor(item.count);
    if (!Number.isFinite(count) || count <= 0) continue;

    // Cap to remaining space in the 60-card deck.
    count = Math.min(count, DECK_SIZE - totalCount);

    // Cap by copy limit, unless this is exempt Basic Energy.
    if (!isBasicEnergy(card)) {
      const key = normalizeCardName(card.name);
      const limit = getSpecialSameNameCopyLimit(card) ?? DEFAULT_COPY_LIMIT;
      const alreadyUsed = nameGroupTotals.get(key) ?? 0;
      const allowed = Math.max(0, limit - alreadyUsed);
      count = Math.min(count, allowed);
      nameGroupTotals.set(key, alreadyUsed + count);
    }

    if (count <= 0) continue;

    // Same card ID appearing more than once in the model's own output
    // (rather than as a single higher count) merges into one entry.
    const existing = result.find((e) => e.cardId === card.id);
    if (existing) {
      existing.quantity += count;
    } else {
      result.push({ cardId: card.id, cardName: card.name, quantity: count });
    }

    totalCount += count;
  }

  return result;
}
