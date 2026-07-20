import type { Card, DeckFormat } from "@/types/card";
import type { DeckCardEntry, DeckStatus, DeckValidationIssue, DeckValidationResult } from "@/types/deck";
import { normalizeCardName } from "@/lib/deck/normalize-name";

/**
 * Bump whenever the validation logic below changes in a way that could
 * change a deck's computed status or issues. Included in the AI-review
 * cache hash so a rules change invalidates previously cached reviews,
 * rather than serving a review computed against stale logic.
 */
export const VALIDATION_RULES_VERSION = "1.0.0";

const DECK_SIZE = 60;
const DEFAULT_COPY_LIMIT = 4;

/**
 * Detects an explicit lower per-name copy limit stated in a card's rules
 * text (e.g. Prism Star "◇" cards, ACE SPEC cards restricted to a single
 * copy sharing the same name). This is a deliberately narrow, conservative
 * pattern match on "only 1 ... deck"-style phrasing — see DECISIONS.md for
 * what this does and doesn't cover.
 */
export function getSpecialSameNameCopyLimit(card: Pick<Card, "rules">): number | null {
  const sentences = card.rules.join(" ").split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (!/\bdeck\b/i.test(sentence)) continue;
    if (!/\b1\b/.test(sentence)) continue;
    if (/\bonly\b/i.test(sentence) || /\bno more than\b/i.test(sentence) || /\bcopy\b/i.test(sentence)) {
      return 1;
    }
  }
  return null;
}

export function isBasicEnergy(card: Pick<Card, "supertype" | "subtypes">): boolean {
  return card.supertype === "Energy" && card.subtypes.includes("Basic");
}

export function isBasicPokemon(card: Pick<Card, "supertype" | "subtypes">): boolean {
  return card.supertype === "Pokémon" && card.subtypes.includes("Basic");
}

const CONSTRUCTION_BLOCKING_CODES: DeckValidationIssue["code"][] = [
  "TOO_MANY_CARDS",
  "COPY_LIMIT_EXCEEDED",
  "SPECIAL_COPY_LIMIT_EXCEEDED",
  "NO_BASIC_POKEMON",
  "CARD_NOT_FOUND",
];

/**
 * Computes deck validation deterministically. Card data for every entry
 * must already be resolved by the caller (see resolve-cards.ts) — this
 * function performs no lookups itself, which is what makes it safe to
 * unit test with plain fixtures.
 */
export function computeDeckValidation(
  entries: DeckCardEntry[],
  cardsById: Record<string, Card>,
  missingCardIds: string[],
  format: DeckFormat,
): DeckValidationResult {
  const issues: DeckValidationIssue[] = [];
  const totalCount = entries.reduce((sum, e) => sum + e.quantity, 0);

  if (totalCount < DECK_SIZE) {
    issues.push({
      code: "TOO_FEW_CARDS",
      severity: "warning",
      message: `Deck has ${totalCount} of ${DECK_SIZE} cards.`,
    });
  } else if (totalCount > DECK_SIZE) {
    issues.push({
      code: "TOO_MANY_CARDS",
      severity: "error",
      message: `Deck has ${totalCount} cards, which is more than the ${DECK_SIZE}-card limit.`,
    });
  }

  for (const missingId of missingCardIds) {
    issues.push({
      code: "CARD_NOT_FOUND",
      severity: "error",
      message: `A card in this deck (${missingId}) could not be found in the card catalogue.`,
      cardIds: [missingId],
    });
  }

  // Group by normalised name for copy-limit checks.
  const groups = new Map<string, { entries: DeckCardEntry[]; quantity: number }>();
  for (const entry of entries) {
    if (missingCardIds.includes(entry.cardId)) continue; // can't evaluate limits for unknown cards
    const key = normalizeCardName(entry.cardName);
    const group = groups.get(key) ?? { entries: [], quantity: 0 };
    group.entries.push(entry);
    group.quantity += entry.quantity;
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const cards = group.entries.map((e) => cardsById[e.cardId]).filter((c): c is Card => Boolean(c));
    if (cards.length === 0) continue;

    const anyBasicEnergy = cards.some(isBasicEnergy);
    if (anyBasicEnergy) continue; // Basic Energy is exempt from copy limits entirely

    const specialLimits = cards.map(getSpecialSameNameCopyLimit).filter((l): l is number => l !== null);
    const limit = specialLimits.length > 0 ? Math.min(...specialLimits) : DEFAULT_COPY_LIMIT;

    if (group.quantity > limit) {
      const cardIds = group.entries.map((e) => e.cardId);
      issues.push({
        code: limit < DEFAULT_COPY_LIMIT ? "SPECIAL_COPY_LIMIT_EXCEEDED" : "COPY_LIMIT_EXCEEDED",
        severity: "error",
        message:
          limit < DEFAULT_COPY_LIMIT
            ? `"${cards[0]?.name}" is limited to ${limit} copy in a deck (${group.quantity} included).`
            : `"${cards[0]?.name}" has ${group.quantity} copies, which is more than the ${limit}-copy limit.`,
        cardIds,
      });
    }
  }

  // Format legality (does not block "complete", only "format_legal").
  const formatIssues: DeckValidationIssue[] = [];
  if (format !== "all") {
    for (const entry of entries) {
      const card = cardsById[entry.cardId];
      if (!card) continue;
      if (card.legalities[format] !== "legal") {
        formatIssues.push({
          code: "FORMAT_ILLEGAL",
          severity: "error",
          message: `"${card.name}" is not legal in the ${format} format.`,
          cardIds: [entry.cardId],
        });
      }
    }
  }

  if (totalCount === DECK_SIZE) {
    const hasBasicPokemon = entries.some((e) => {
      const card = cardsById[e.cardId];
      return card && isBasicPokemon(card);
    });
    if (!hasBasicPokemon) {
      issues.push({
        code: "NO_BASIC_POKEMON",
        severity: "error",
        message: "A complete deck must contain at least one Basic Pokémon.",
      });
    }
  }

  const allIssues = [...issues, ...formatIssues];

  const hasConstructionBlockingIssue = issues.some((i) =>
    CONSTRUCTION_BLOCKING_CODES.includes(i.code),
  );

  let status: DeckStatus;
  if (totalCount !== DECK_SIZE || hasConstructionBlockingIssue) {
    status = "draft";
  } else if (formatIssues.length > 0) {
    status = "complete";
  } else {
    status = "format_legal";
  }

  return { status, issues: allIssues };
}
