import "server-only";
import type { Card, DeckFormat } from "@/types/card";
import type { DeckCardEntry, DeckStatistics } from "@/types/deck";
import { pokemonTcgApiProvider } from "@/lib/providers/pokemon-tcg-api";
import { getEvolutionLineNames } from "@/lib/deck/evolution-line";
import { isCardLegalInFormat } from "@/lib/format-legality";

const MAX_CANDIDATES = 30;

// A small, well-known set of generic staple Trainer cards, grouped by the
// role they fill. Real, widely-used card names — used only to seed a
// targeted search, never added to a deck or shown to the model as
// anything other than one of several candidates it may or may not use.
// This list is a judgment call, not an exhaustive or "correct" set —
// revisit if particular staples consistently feel missing.
const STAPLE_DRAW_TRAINER_NAMES = ["Professor's Research", "Iono"];
const STAPLE_SEARCH_TRAINER_NAMES = ["Ultra Ball", "Nest Ball", "Quick Ball"];
const STAPLE_UTILITY_TRAINER_NAMES = ["Switch", "Ordinary Rod", "Rare Candy", "Boss's Orders"];

async function findExactNameMatches(name: string, supertype?: Card["supertype"]): Promise<Card[]> {
  try {
    const result = await pokemonTcgApiProvider.searchCards({
      name,
      supertype,
      pageSize: 10,
    });
    return result.cards.filter((c) => c.name.toLowerCase() === name.toLowerCase());
  } catch {
    return []; // candidate gathering is best-effort; a provider hiccup shouldn't fail the whole review
  }
}

/**
 * Builds a bounded candidate pool: real cards from the provider that are
 * plausibly relevant to this deck's actual composition, capped well below
 * what would make the prompt unwieldy. The model is only ever allowed to
 * suggest additions from this exact set (enforced later in
 * verify-review.ts, not just by the prompt).
 */
export async function gatherCandidateCards(
  entries: DeckCardEntry[],
  cardsById: Record<string, Card>,
  statistics: DeckStatistics,
  format: DeckFormat,
): Promise<Card[]> {
  const deckCardIds = new Set(entries.map((e) => e.cardId));
  const candidates = new Map<string, Card>();

  function addIfNew(card: Card) {
    if (candidates.size >= MAX_CANDIDATES) return;
    if (deckCardIds.has(card.id)) return; // already in the deck, not a useful "addition"
    // Filtering illegal candidates out up front (rather than only during
    // later verification) means a candidate slot is never spent on a card
    // that could never survive verification anyway.
    if (!isCardLegalInFormat(card, format)) return;
    candidates.set(card.id, card);
  }

  // 1. Evolution-line completions for Pokémon already in the deck.
  const evolutionNames = new Set<string>();
  for (const entry of entries) {
    const card = cardsById[entry.cardId];
    if (!card) continue;
    for (const name of getEvolutionLineNames(card)) evolutionNames.add(name);
  }
  for (const name of evolutionNames) {
    if (candidates.size >= MAX_CANDIDATES) break;
    const matches = await findExactNameMatches(name, "Pokémon");
    matches.slice(0, 2).forEach(addIfNew);
  }

  // 2. Draw support. Always searched (not just when the deck looks light
  // on it) so the model has real options to compare against, even for a
  // deck that already has some — "already has some" isn't the same as
  // "has the best available."
  for (const name of STAPLE_DRAW_TRAINER_NAMES) {
    if (candidates.size >= MAX_CANDIDATES) break;
    const matches = await findExactNameMatches(name, "Trainer");
    matches.slice(0, 1).forEach(addIfNew);
  }

  // 3. Search support.
  for (const name of STAPLE_SEARCH_TRAINER_NAMES) {
    if (candidates.size >= MAX_CANDIDATES) break;
    const matches = await findExactNameMatches(name, "Trainer");
    matches.slice(0, 1).forEach(addIfNew);
  }

  // 4. General utility/consistency staples (retreat, recovery, tech).
  for (const name of STAPLE_UTILITY_TRAINER_NAMES) {
    if (candidates.size >= MAX_CANDIDATES) break;
    const matches = await findExactNameMatches(name, "Trainer");
    matches.slice(0, 1).forEach(addIfNew);
  }

  // 5. Basic Energy matching the Pokémon types already in the deck, if energy count looks low.
  const pokemonTypes = Object.keys(statistics.pokemonTypeDistribution);
  if (statistics.totalEnergy < 10) {
    for (const type of pokemonTypes) {
      if (candidates.size >= MAX_CANDIDATES) break;
      try {
        const result = await pokemonTcgApiProvider.searchCards({
          supertype: "Energy",
          pokemonType: type,
          pageSize: 5,
        });
        result.cards
          .filter((c) => c.subtypes.includes("Basic"))
          .slice(0, 1)
          .forEach(addIfNew);
      } catch {
        // best-effort, same as above
      }
    }
  }

  // 6. Other attackers sharing a type already present in the deck — gives
  // the model real alternatives to consider for the deck's main
  // strategy, not just support cards.
  for (const type of pokemonTypes) {
    if (candidates.size >= MAX_CANDIDATES) break;
    try {
      const result = await pokemonTcgApiProvider.searchCards({
        supertype: "Pokémon",
        pokemonType: type,
        pageSize: 10,
      });
      result.cards
        .filter((c) => c.attacks.length > 0)
        .slice(0, 3)
        .forEach(addIfNew);
    } catch {
      // best-effort, same as above
    }
  }

  return [...candidates.values()];
}
