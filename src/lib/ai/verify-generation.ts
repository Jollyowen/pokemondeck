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
 * - Total Energy count is deterministically capped at `maxEnergyCount`
 *   when provided (the archetype's energyRange upper bound). Basic
 *   Energy is exempt from the per-name copy limit above, so nothing else
 *   stops a single Energy candidate from being assigned an arbitrarily
 *   large count — a real reported bug produced a 36-Energy deck against
 *   an 8-12 target.
 * - Total Pokémon and Trainer counts are capped the same way via
 *   `maxPokemonCount`/`maxTrainerCount` (each category's own archetype
 *   range upper bound) — generalized from the Energy-only cap above
 *   after a real report: the model's raw output totaled 138 cards
 *   against a 60-card target (more than double), and because this
 *   function processes entries in whatever order the model listed them
 *   and simply stops once the running total hits 60, a raw overshoot
 *   that severe made the FINAL composition arbitrary rather than
 *   proportional — whichever categories happened to be listed first
 *   dominated the truncated result, producing a real case landing at 16
 *   Pokémon / 38 Trainer / 6 Energy against a control archetype's
 *   10-15 / 25-32 / 10-14 targets. Capping every category's ceiling
 *   during construction, not just Energy's, makes an upper-bound
 *   composition violation structurally impossible regardless of how
 *   badly the model overshoots the total or in what order it lists
 *   entries. The prompt asks the model to stay in range, and the one
 *   bounded refinement pass nudges it if it doesn't, but neither is a
 *   guarantee; this makes the upper bounds hard, structural ones, the
 *   same way copy limits and the 60-card cap already are. Deliberately
 *   NOT enforcing a floor the same way itself — a deck genuinely short
 *   on a category after this function stays short here; see
 *   `topUpExistingCardsToSixty` below for the separate, later step that
 *   handles reaching exactly 60 (which also respects these same range
 *   ceilings, so it can't undo this cap while filling the last few
 *   slots).
 */
export function buildVerifiedGeneratedDeck(
  rawCards: RawGeneratedCard[],
  candidatesById: Record<string, Card>,
  options?: { maxEnergyCount?: number; maxPokemonCount?: number; maxTrainerCount?: number },
): DeckCardEntry[] {
  const nameGroupTotals = new Map<string, number>();
  const result: DeckCardEntry[] = [];
  let totalCount = 0;
  const categoryCounts = { Pokémon: 0, Trainer: 0, Energy: 0 };
  const categoryMax: Partial<Record<Card["supertype"], number>> = {
    Pokémon: options?.maxPokemonCount,
    Trainer: options?.maxTrainerCount,
    Energy: options?.maxEnergyCount,
  };

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

    // Cap this card's supertype category at its own archetype-range
    // ceiling, when supplied — see the doc comment above for why this
    // now covers all three categories, not just Energy.
    const thisCategoryMax = categoryMax[card.supertype];
    if (thisCategoryMax !== undefined) {
      const categoryAllowed = Math.max(0, thisCategoryMax - categoryCounts[card.supertype]);
      count = Math.min(count, categoryAllowed);
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
    categoryCounts[card.supertype] += count;
  }

  return result;
}

/**
 * Last-resort deterministic top-up to exactly 60 cards, run after
 * `buildVerifiedGeneratedDeck` (and `ensureEvolutionPrerequisites`) if
 * the deck is still short. A real production case had every composition
 * check pass — Pokémon/Trainer/Energy all correctly within the
 * archetype's ranges, draw/search minimums met — with the only failure
 * being the raw total landing at 52-54 instead of 60, despite the
 * model's own explanation claiming it summed to exactly 60.
 *
 * This does NOT invent any new card the model didn't choose — it only
 * increases the quantity of entries ALREADY in the deck, which is a
 * meaningfully smaller liberty than adding a new card type, and doesn't
 * actually conflict with "never fabricate content the model didn't
 * select": every card that ends up with a higher count is still one the
 * model genuinely picked. Bounded the same way every other construction
 * step in this app already is:
 * - Per-name copy limits (4, or a card's own special limit) are
 *   re-derived from the deck's current state and never exceeded.
 * - Each category (Pokémon/Trainer/Energy) is never pushed past its
 *   archetype's own range ceiling — this is what keeps the top-up from
 *   undoing the very composition checks that were already passing.
 * - If every entry is already at its own cap (copy limit or category
 *   ceiling) with the deck still short, the function simply stops —
 *   this can happen with a very thin selection, and the deck is saved
 *   short and flagged exactly as before, never silently claimed as a
 *   full 60 when it structurally couldn't reach one.
 */
export function topUpExistingCardsToSixty(
  entries: DeckCardEntry[],
  candidatesById: Record<string, Card>,
  categoryRanges: { pokemon: [number, number]; trainer: [number, number]; energy: [number, number] },
): DeckCardEntry[] {
  let total = entries.reduce((sum, e) => sum + e.quantity, 0);
  if (total >= DECK_SIZE) return entries;

  const result = entries.map((e) => ({ ...e }));

  const nameGroupTotals = new Map<string, number>();
  const categoryTotals = { Pokémon: 0, Trainer: 0, Energy: 0 };
  for (const e of result) {
    const card = candidatesById[e.cardId];
    if (!card) continue;
    categoryTotals[card.supertype] += e.quantity;
    if (!isBasicEnergy(card)) {
      const key = normalizeCardName(card.name);
      nameGroupTotals.set(key, (nameGroupTotals.get(key) ?? 0) + e.quantity);
    }
  }

  const categoryRangeFor = (supertype: Card["supertype"]): [number, number] =>
    supertype === "Pokémon" ? categoryRanges.pokemon : supertype === "Trainer" ? categoryRanges.trainer : categoryRanges.energy;

  let progressMade = true;
  while (total < DECK_SIZE && progressMade) {
    progressMade = false;
    for (const entry of result) {
      if (total >= DECK_SIZE) break;

      const card = candidatesById[entry.cardId];
      if (!card) continue;

      const [, categoryMax] = categoryRangeFor(card.supertype);
      if (categoryTotals[card.supertype] >= categoryMax) continue;

      if (!isBasicEnergy(card)) {
        const key = normalizeCardName(card.name);
        const limit = getSpecialSameNameCopyLimit(card) ?? DEFAULT_COPY_LIMIT;
        const alreadyUsed = nameGroupTotals.get(key) ?? 0;
        if (alreadyUsed >= limit) continue;
        nameGroupTotals.set(key, alreadyUsed + 1);
      }

      entry.quantity += 1;
      categoryTotals[card.supertype] += 1;
      total += 1;
      progressMade = true;
    }
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
