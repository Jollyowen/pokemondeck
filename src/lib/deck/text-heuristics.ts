import type { Card } from "@/types/card";

/**
 * Bump this whenever the detection patterns below change, so any stored
 * output that references it (e.g. a cached statistics snapshot) can be
 * invalidated. Draw-support and search-support counts are the only two
 * statistics that depend on interpreting free text rather than structured
 * card fields, per the deck-statistics requirement — this module isolates
 * that interpretation so it can be reasoned about and versioned on its own.
 */
export const TEXT_HEURISTICS_VERSION = "1.0.0";

const DRAW_SUPPORT_PATTERNS = [/\bdraw\b[^.]*\bcards?\b/i, /\bdraw\s+\d+\b/i, /\bdraw\s+a\s+card\b/i];

const SEARCH_SUPPORT_PATTERNS = [
  /\bsearch\s+your\s+deck\b/i,
  /\blook\s+at\s+the\s+top\b/i,
  /\breveal\s+.*\bfrom\s+your\s+deck\b/i,
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
