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

/**
 * Ensures every non-Basic Pokémon in the deck has its evolution
 * prerequisite present — a Stage 1 is essentially unplayable without at
 * least one copy of the Basic it evolves from actually in the deck (there
 * would be no legal way to get it into play). The AI is asked to build a
 * complete line in the prompt, but that's advisory; this pass makes it
 * deterministic, the same way copy limits and the 60-card cap are
 * enforced by construction rather than left to the model's discretion.
 *
 * Walks the full chain (Stage 2 -> Stage 1 -> Basic), adding a matching
 * printing from the candidate pool for any missing prerequisite — never
 * inventing a card outside candidatesById. Added quantity mirrors the
 * dependent card's own count, capped by the normal copy limit and by
 * remaining space under 60. If no candidate exists for a missing
 * prerequisite, or there's no room left, that link simply can't be
 * completed — the resulting deck will show the normal validation issues
 * once it lands in the editor, same as if a person had built it that way
 * by hand.
 */
export function ensureEvolutionPrerequisites(
  entries: DeckCardEntry[],
  candidatesById: Record<string, Card>,
): DeckCardEntry[] {
  const working = new Map<string, DeckCardEntry>(entries.map((e) => [e.cardId, { ...e }]));

  const nameGroupTotals = new Map<string, number>();
  for (const entry of working.values()) {
    const card = candidatesById[entry.cardId];
    if (!card) continue;
    const key = normalizeCardName(card.name);
    nameGroupTotals.set(key, (nameGroupTotals.get(key) ?? 0) + entry.quantity);
  }

  const candidatesByName = new Map<string, Card[]>();
  for (const card of Object.values(candidatesById)) {
    if (card.supertype !== "Pokémon") continue;
    const key = normalizeCardName(card.name);
    const list = candidatesByName.get(key) ?? [];
    list.push(card);
    candidatesByName.set(key, list);
  }

  function totalCount(): number {
    let total = 0;
    for (const entry of working.values()) total += entry.quantity;
    return total;
  }

  const queue: Array<{ name: string; desiredQty: number }> = [];
  for (const entry of working.values()) {
    const card = candidatesById[entry.cardId];
    if (card?.evolvesFrom) queue.push({ name: card.evolvesFrom, desiredQty: entry.quantity });
  }

  const processed = new Set<string>();

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const key = normalizeCardName(next.name);
    if (processed.has(key)) continue;
    processed.add(key);

    const alreadyPresent = nameGroupTotals.get(key) ?? 0;
    if (alreadyPresent > 0) {
      // Already satisfied — still walk further up the chain from whichever
      // printing is present, in case it's itself a Stage 1 needing a Basic.
      for (const entry of working.values()) {
        const card = candidatesById[entry.cardId];
        if (card && normalizeCardName(card.name) === key && card.evolvesFrom) {
          queue.push({ name: card.evolvesFrom, desiredQty: entry.quantity });
        }
      }
      continue;
    }

    const matches = candidatesByName.get(key);
    if (!matches || matches.length === 0) continue; // not in the candidate pool — can't force it

    const remainingSpace = 60 - totalCount();
    if (remainingSpace <= 0) continue;

    const card = matches[0]!;
    const limit = isBasicEnergy(card) ? Infinity : (getSpecialSameNameCopyLimit(card) ?? 4);
    const qtyToAdd = Math.max(1, Math.min(next.desiredQty, limit, remainingSpace));

    const existing = working.get(card.id);
    if (existing) {
      existing.quantity += qtyToAdd;
    } else {
      working.set(card.id, { cardId: card.id, cardName: card.name, quantity: qtyToAdd });
    }
    nameGroupTotals.set(key, alreadyPresent + qtyToAdd);

    if (card.evolvesFrom) {
      queue.push({ name: card.evolvesFrom, desiredQty: qtyToAdd });
    }
  }

  return [...working.values()];
}
