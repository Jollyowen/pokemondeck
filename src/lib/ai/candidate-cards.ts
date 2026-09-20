import "server-only";
import type { Card, DeckFormat } from "@/types/card";
import type { DeckCardEntry, DeckStatistics } from "@/types/deck";
import { searchLocalCards } from "@/lib/cards/local-card-repository";
import { getEvolutionLineNames } from "@/lib/deck/evolution-line";
import { isBasicEnergy } from "@/lib/deck/validate";
import { isCardLegalInFormat } from "@/lib/format-legality";

const MAX_CANDIDATES = 30;

// A small, well-known set of generic staple Trainer cards, grouped by the
// role they fill. Real, widely-used card names — used only to seed a
// targeted search, never added to a deck or shown to the model as
// anything other than one of several candidates it may or may not use.
// This list is a judgment call, not an exhaustive or "correct" set —
// widened from an original 9 names after real generation reports came
// back with too little Trainer variety to comfortably reach a 20-42
// Trainer target (only 9 possible distinct cards, capped at 4 copies
// each, meant hitting even the low end of that range left little room
// for the model to actually choose between options).
const STAPLE_DRAW_TRAINER_NAMES = ["Professor's Research", "Iono", "Judge", "Cynthia"];
const STAPLE_SEARCH_TRAINER_NAMES = ["Ultra Ball", "Nest Ball", "Quick Ball", "Level Ball", "Great Ball"];
const STAPLE_UTILITY_TRAINER_NAMES = [
  "Switch",
  "Ordinary Rod",
  "Rare Candy",
  "Boss's Orders",
  "Escape Rope",
  "Super Rod",
];

// Well-known generic "engine" Pokémon — picked for an ability (draw,
// search, or similar utility) rather than for sharing the target's type,
// so the type-scoped search below would never surface them. Each entry
// is [name, evolvesFrom-or-null] so the Basic half of a two-stage engine
// (e.g. Bidoof -> Bibarel) gets pulled in alongside the evolved form that
// actually has the useful ability — a Stage 1 with no Basic in the pool
// is exactly the kind of thing ensureEvolutionPrerequisites has to paper
// over later, better to just gather both up front. Same judgment-call
// caveat as the Trainer staple lists above.
const STAPLE_UTILITY_POKEMON_NAMES: Array<[name: string, evolvesFrom: string | null]> = [
  ["Bibarel", "Bidoof"],
  ["Manaphy", null],
];

/**
 * Normalises quote characters before an exact-name comparison. TCGdex's
 * own data uses a curly apostrophe (U+2019) in names like "Professor’s
 * Research" — our hardcoded staple lists use a plain ASCII apostrophe
 * (U+0027). Left unhandled, that's not just a near-miss in the exact-
 * match filter below: `searchLocalCards`'s ILIKE is a literal substring
 * match, so the DB query itself would return zero rows for a name whose
 * apostrophe doesn't match byte-for-byte, before any filtering even runs.
 * Exported purely so this is directly unit-testable without exercising
 * the Supabase-calling search function around it.
 */
export function normalizeQuotes(value: string): string {
  return value.replace(/[\u2018\u2019\u201B]/g, "'");
}

/**
 * Builds the actual ILIKE search term: replaces a straight apostrophe
 * with Postgres's `_` wildcard (matches any single character), so the
 * query itself matches a name regardless of which apostrophe style the
 * stored data actually uses. The exact-name filter below still applies
 * afterward (via normalizeQuotes), so this widening can't accidentally
 * let through some unrelated card that merely contains a `_`-matchable
 * substring.
 */
export function toIlikeSearchTerm(name: string): string {
  return name.replace(/'/g, "_");
}

async function findExactNameMatches(
  name: string,
  supertype?: Card["supertype"],
  pageSize = 10,
): Promise<Card[]> {
  try {
    const result = await searchLocalCards({
      name: toIlikeSearchTerm(name),
      supertype,
      pageSize,
    });
    const target = normalizeQuotes(name).toLowerCase();
    return result.cards.filter((c) => normalizeQuotes(c.name).toLowerCase() === target);
  } catch {
    return []; // candidate gathering is best-effort; a provider hiccup shouldn't fail the whole review
  }
}

/**
 * Filters to legal-in-format cards BEFORE taking the top `n` — real bug,
 * found by tracing a real report of a near-empty candidate pool despite
 * every staple search finding a real card by name. Every candidate-
 * gathering step below used to slice to a small number first and let
 * `addIfNew`'s legality check reject whatever didn't qualify afterward —
 * which means if the most-recent printing(s) of a name (results are
 * ordered newest-first) happen to be a promo or special print without
 * Standard legality, the whole slice could come back illegal even though
 * an older, legal reprint of the exact same card exists a few positions
 * further down the same result list. This is the identical shape of bug
 * already fixed once for target-Pokémon resolution (see
 * `legalTargetMatches` below) — it just hadn't been applied to any of
 * the other gathering steps in either this function or
 * `gatherDeckGenerationCandidates`. Exported purely so this is directly
 * unit-testable without exercising the Supabase-calling search functions
 * around it.
 */
export function takeLegal(cards: Card[], format: DeckFormat, n: number): Card[] {
  return cards.filter((c) => isCardLegalInFormat(c, format)).slice(0, n);
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
    takeLegal(matches, format, 2).forEach(addIfNew);
  }

  // 2. Draw support. Always searched (not just when the deck looks light
  // on it) so the model has real options to compare against, even for a
  // deck that already has some — "already has some" isn't the same as
  // "has the best available."
  for (const name of STAPLE_DRAW_TRAINER_NAMES) {
    if (candidates.size >= MAX_CANDIDATES) break;
    const matches = await findExactNameMatches(name, "Trainer");
    takeLegal(matches, format, 1).forEach(addIfNew);
  }

  // 3. Search support.
  for (const name of STAPLE_SEARCH_TRAINER_NAMES) {
    if (candidates.size >= MAX_CANDIDATES) break;
    const matches = await findExactNameMatches(name, "Trainer");
    takeLegal(matches, format, 1).forEach(addIfNew);
  }

  // 4. General utility/consistency staples (retreat, recovery, tech).
  for (const name of STAPLE_UTILITY_TRAINER_NAMES) {
    if (candidates.size >= MAX_CANDIDATES) break;
    const matches = await findExactNameMatches(name, "Trainer");
    takeLegal(matches, format, 1).forEach(addIfNew);
  }

  // 5. Basic Energy matching the Pokémon types already in the deck, if energy count looks low.
  const pokemonTypes = Object.keys(statistics.pokemonTypeDistribution);
  if (statistics.totalEnergy < 10) {
    for (const type of pokemonTypes) {
      if (candidates.size >= MAX_CANDIDATES) break;
      try {
        const result = await searchLocalCards({
          supertype: "Energy",
          pokemonType: type,
          pageSize: 5,
        });
        takeLegal(result.cards.filter(isBasicEnergy), format, 1).forEach(addIfNew);
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
      const result = await searchLocalCards({
        supertype: "Pokémon",
        pokemonType: type,
        pageSize: 10,
      });
      takeLegal(
        result.cards.filter((c) => c.attacks.length > 0),
        format,
        3,
      ).forEach(addIfNew);
    } catch {
      // best-effort, same as above
    }
  }

  // 7. Well-known generic engine Pokémon (draw/search/utility abilities),
  // searched by name regardless of type — see the identical step in
  // gatherDeckGenerationCandidates below for why the type-scoped search
  // above can't surface these on its own.
  for (const [name, evolvesFrom] of STAPLE_UTILITY_POKEMON_NAMES) {
    if (candidates.size >= MAX_CANDIDATES) break;
    takeLegal(await findExactNameMatches(name, "Pokémon"), format, 1).forEach(addIfNew);
    if (evolvesFrom) {
      takeLegal(await findExactNameMatches(evolvesFrom, "Pokémon"), format, 1).forEach(addIfNew);
    }
  }

  const result = [...candidates.values()];
  return result;
}

const GENERATION_MAX_CANDIDATES = 80;

export type GenerationCandidateResult =
  | { targetCard: Card; candidates: Card[] }
  | { targetCard: null; candidates: [] };

export type CandidateGatheringDiagnostics = {
  bySupertype: Record<string, number>;
  /** Staple names that resolved zero matches at all — the clearest signal of a name-matching or data-population problem, not a legality filter. */
  staplesMissed: string[];
  totalStaplesSearched: number;
};

/**
 * Resolves the named Pokémon and builds a broad, format-filtered candidate
 * pool wide enough to construct a full 60-card deck from scratch — the
 * target's evolution line, other Pokémon sharing its type(s), a small set
 * of well-known off-type "engine" Pokémon (draw/search abilities that
 * aren't tied to any particular type), generic staple Trainers, and
 * matching Basic Energy. Every candidate is a real card from the
 * provider; nothing here is invented.
 *
 * Returns targetCard: null when the named Pokémon can't be found at all,
 * so the caller can fail with a clear "couldn't find that Pokémon" error
 * rather than generating a deck around nothing.
 */
export async function gatherDeckGenerationCandidates(
  pokemonName: string,
  format: DeckFormat,
): Promise<
  GenerationCandidateResult & {
    targetLegalInFormat: boolean;
    foundButIllegal: boolean;
    diagnostics: CandidateGatheringDiagnostics;
  }
> {
  // pageSize is deliberately much higher than the default here: results
  // are ordered alphabetically by set ID, not by recency, so a low limit
  // could genuinely miss the specific (often more recent) printing that's
  // legal in the requested format, even though the Pokémon has plenty of
  // printings overall. This is the primary lookup the whole request is
  // grounded in, so it's worth being thorough here specifically.
  const targetMatches = await findExactNameMatches(pokemonName, "Pokémon", 100);
  const legalTargetMatches = targetMatches.filter((c) => isCardLegalInFormat(c, format));
  const targetCard = legalTargetMatches[0] ?? null;
  if (!targetCard) {
    // Distinguish "no card by this name exists at all" from "it exists,
    // just not legal in this format" so the caller can give an accurate
    // error instead of a generic "not found".
    return {
      targetCard: null,
      candidates: [],
      targetLegalInFormat: false,
      foundButIllegal: targetMatches.length > 0,
      diagnostics: { bySupertype: {}, staplesMissed: [], totalStaplesSearched: 0 },
    };
  }

  const candidates = new Map<string, Card>();
  function addIfNew(card: Card) {
    if (candidates.size >= GENERATION_MAX_CANDIDATES) return;
    // Strict format-legality filter: a generated deck must only ever be
    // built from candidates that are actually legal in the requested
    // format (or format === "all", where isCardLegalInFormat always
    // returns true). An earlier version of this function deliberately
    // allowed illegal candidates through — that was to fix a real bug
    // where the requested Pokémon itself got excluded from its own
    // candidate pool (see DECISIONS.md). That's now handled correctly
    // above: the target is resolved only from its legal printings, with
    // a clear error if none exist, rather than by loosening the filter
    // for every other candidate too.
    if (!isCardLegalInFormat(card, format)) return;
    candidates.set(card.id, card);
  }

  // The target itself, and its printings — capped, not every printing
  // found. Every other step here is sliced to a small number; this one
  // previously wasn't (targetMatches.forEach with no slice), and a
  // popular Pokémon can have dozens of reprints. Left unsliced, that
  // could consume most of the 80-candidate budget on redundant printings
  // of the SAME card before "other Pokémon sharing a type" below ever
  // ran — a real reported bug (generated decks with no supporting
  // Pokémon at all beyond the evolution line). 5 printings is enough
  // headroom for the model to pick a specific art/set if it has a reason
  // to, without crowding out everything else. Uses the already-legal-
  // filtered legalTargetMatches (not the raw targetMatches) for the same
  // reason takeLegal exists below — the top 5 most-recent printings by
  // release date could otherwise be dominated by illegal promos.
  legalTargetMatches.slice(0, 5).forEach(addIfNew);

  // The target's full evolution line, in both directions.
  const evolutionNames = getEvolutionLineNames(targetCard);
  for (const name of evolutionNames) {
    if (candidates.size >= GENERATION_MAX_CANDIDATES) break;
    const matches = await findExactNameMatches(name, "Pokémon");
    takeLegal(matches, format, 3).forEach(addIfNew);
  }

  // Other Pokémon sharing a type with the target, as support/backup attackers.
  for (const type of targetCard.types) {
    if (candidates.size >= GENERATION_MAX_CANDIDATES) break;
    try {
      const result = await searchLocalCards({ supertype: "Pokémon", pokemonType: type, pageSize: 20 });
      takeLegal(
        result.cards.filter((c) => c.attacks.length > 0),
        format,
        10,
      ).forEach(addIfNew);
    } catch {
      // best-effort
    }
  }

  // Well-known generic engine Pokémon (draw/search/utility abilities),
  // searched by name regardless of type — the type-scoped search above
  // would never surface these, since their value isn't tied to sharing
  // the target's type. Without this, the only possible "supporting
  // Pokémon" the model could ever propose were same-type attackers, which
  // is a real reported cause of decks with no meaningful support Pokémon
  // beyond the evolution line for a target with a thin same-type pool.
  const staplesMissed: string[] = [];
  let staplesSearched = 0;
  for (const [name, evolvesFrom] of STAPLE_UTILITY_POKEMON_NAMES) {
    if (candidates.size >= GENERATION_MAX_CANDIDATES) break;
    staplesSearched += 1;
    const matches = await findExactNameMatches(name, "Pokémon");
    if (matches.length === 0) staplesMissed.push(name);
    takeLegal(matches, format, 2).forEach(addIfNew);
    if (evolvesFrom) {
      staplesSearched += 1;
      const evoMatches = await findExactNameMatches(evolvesFrom, "Pokémon");
      if (evoMatches.length === 0) staplesMissed.push(evolvesFrom);
      takeLegal(evoMatches, format, 2).forEach(addIfNew);
    }
  }

  // Generic staple Trainers across all roles.
  for (const name of [...STAPLE_DRAW_TRAINER_NAMES, ...STAPLE_SEARCH_TRAINER_NAMES, ...STAPLE_UTILITY_TRAINER_NAMES]) {
    if (candidates.size >= GENERATION_MAX_CANDIDATES) break;
    staplesSearched += 1;
    const matches = await findExactNameMatches(name, "Trainer");
    if (matches.length === 0) staplesMissed.push(name);
    takeLegal(matches, format, 1).forEach(addIfNew);
  }

  // Basic Energy matching the target's type(s).
  for (const type of targetCard.types) {
    if (candidates.size >= GENERATION_MAX_CANDIDATES) break;
    try {
      const result = await searchLocalCards({ supertype: "Energy", pokemonType: type, pageSize: 5 });
      takeLegal(result.cards.filter(isBasicEnergy), format, 1).forEach(addIfNew);
    } catch {
      // best-effort
    }
  }

  const candidateList = [...candidates.values()];
  // No write-through cache needed here anymore — every candidate already
  // came from the local database mirror (searchLocalCards), not a live
  // provider call, so there's nothing stale to write back.

  // Diagnostic breakdown, logged by the caller (generation-service.ts) —
  // exists specifically to distinguish "the candidate pool is thin
  // because a name/legality/prompt bug is dropping real matches" from
  // "the candidate pool is thin because the local database this
  // environment is reading from genuinely doesn't have much data in it,"
  // which look identical from the outside (a short candidate list) but
  // need completely different fixes.
  const bySupertype: Record<string, number> = {};
  for (const card of candidateList) {
    bySupertype[card.supertype] = (bySupertype[card.supertype] ?? 0) + 1;
  }

  return {
    targetCard,
    candidates: candidateList,
    targetLegalInFormat: true,
    foundButIllegal: false,
    diagnostics: { bySupertype, staplesMissed, totalStaplesSearched: staplesSearched },
  };
}
