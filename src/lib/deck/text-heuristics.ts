import type { Card } from "@/types/card";

/**
 * Bump this whenever the detection patterns below change, so any stored
 * output that references it (e.g. a cached statistics snapshot) can be
 * invalidated. Draw-support and search-support counts are the only two
 * statistics that depend on interpreting free text rather than structured
 * card fields, per the deck-statistics requirement — this module isolates
 * that interpretation so it can be reasoned about and versioned on its own.
 */
export const TEXT_HEURISTICS_VERSION = "1.1.0";

// "s?" and "(ing)?" cover third-person/gerund phrasing ("draws 2 cards",
// "search(es) your deck") — real bug found while tracing a generated
// deck stuck at exactly 4 draw-support cards no matter what the AI
// refinement pass tried: Trainer card text is usually imperative
// ("Draw 2 cards"), but Pokémon abilities/attacks are very often
// third-person ("This Pokémon draws 2 cards", "draws cards equal to..."),
// which the original bare \bdraw\b / \bsearch\b patterns silently missed
// entirely. That understates the real number of draw/search-support
// cards in a deck's own stats display too, not just AI candidate
// classification — this wasn't an AI-only bug.
const DRAW_SUPPORT_PATTERNS = [
  /\bdraws?\b[^.]*\bcards?\b/i,
  /\bdraws?\s+\d+\b/i,
  /\bdraws?\s+a\s+card\b/i,
  /\bdrawing\s+\d+\b/i,
];

const SEARCH_SUPPORT_PATTERNS = [
  /\bsearch(es)?\s+your\s+deck\b/i,
  /\blook(s|ing)?\s+at\s+the\s+top\b/i,
  /\breveal(s|ing)?\s+.*\bfrom\s+your\s+deck\b/i,
];

function cardText(card: Pick<Card, "rules" | "abilities" | "attacks">): string {
  return [
    ...card.rules,
    ...card.abilities.map((a) => a.text),
    ...card.attacks.map((a) => a.text),
  ].join(" ");
}

export function isDrawSupportCard(card: Pick<Card, "rules" | "abilities" | "attacks">): boolean {
  const text = cardText(card);
  return DRAW_SUPPORT_PATTERNS.some((p) => p.test(text));
}

export function isSearchSupportCard(card: Pick<Card, "rules" | "abilities" | "attacks">): boolean {
  const text = cardText(card);
  return SEARCH_SUPPORT_PATTERNS.some((p) => p.test(text));
}
