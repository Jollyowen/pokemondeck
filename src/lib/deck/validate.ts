import type { Card, DeckFormat } from "@/types/card";
import type { DeckCardEntry, DeckStatus, DeckValidationIssue, DeckValidationResult } from "@/types/deck";
import { normalizeCardName } from "@/lib/deck/normalize-name";

/**
 * Bump whenever the validation logic below changes in a way that could
 * change a deck's computed status or issues. Included in the AI-review
 * cache hash so a rules change invalidates previously cached reviews,
 * rather than serving a review computed against stale logic.
 */
export const VALIDATION_RULES_VERSION = "1.1.1";

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

const ENERGY_TYPE_NAMES = [
  "Grass",
  "Fire",
  "Water",
  "Lightning",
  "Psychic",
  "Fighting",
  "Darkness",
  "Metal",
  "Fairy",
  "Dragon",
  "Colorless",
];

/**
 * Matches "Fire Energy" AND "Basic Fire Energy" — TCGdex uses both
 * naming styles across different set eras (older sets: plain "<Type>
 * Energy"; some newer sets: explicit "Basic <Type> Energy"), and
 * `subtypes` doesn't reliably say "Basic" for either style.
 *
 * Deliberately restricted to the 11 real elemental type names, not
 * "any single word + Energy" — real Special Energy cards are also
 * often named "<SingleWord> Energy" (Rainbow Energy, Aurora Energy,
 * Capture Energy, Twin Energy...) and must NOT be caught by this
 * fallback, since they're correctly subject to the 4-copy limit.
 * Confirmed safe against every real Special Energy name seen in
 * production data so far (Nitro Fire Energy, Heat Fire Energy, Unit
 * Energy GrassFireWater, Blend Energy Grass Fire Psychic Darkness,
 * Double Colorless Energy) — none of them are "<one type word> Energy"
 * with nothing else, so the anchored pattern rejects all of them.
 */
const BASIC_ENERGY_NAME_PATTERN = new RegExp(
  `^(Basic\\s+)?(${ENERGY_TYPE_NAMES.join("|")})\\s+Energy$`,
  "i",
);

/**
 * `subtypes.includes("Basic")` alone isn't reliable for Energy cards.
 * Checked against a real 34-card TCGdex sample: TCGdex's actual value
 * for a regular (non-Special) Energy card's energyType is **"Normal"**,
 * not "Basic" — every single basic Energy card in that sample had
 * "Normal" in subtypes, with zero exceptions, while every real Special
 * Energy card had "Special" instead. "Basic" does still show up
 * sometimes too (from a separate, Pokémon-oriented `stage` field that
 * doesn't really apply to Energy cards, present inconsistently), but
 * it's the extra signal, not the reliable one — this was the original
 * incorrect assumption. pokemontcg.io-era data (still possible via the
 * `provider` field) used "Basic" as its own value for the same concept,
 * so both are checked for compatibility with either provider's rows.
 */
export function isBasicEnergy(card: Pick<Card, "supertype" | "subtypes" | "name">): boolean {
  if (card.supertype !== "Energy") return false;
  if (card.subtypes.includes("Normal") || card.subtypes.includes("Basic")) return true;
  // Defensive fallback for any card where even "Normal"/"Basic" is
  // missing entirely — matches the name pattern below.
  return BASIC_ENERGY_NAME_PATTERN.test(card.name);
}

/**
 * Best-effort elemental type for a Basic Energy card, for callers that
 * need to know *which* type (not just "is this Basic Energy"). Prefers
 * `card.types` when it's actually populated, but that field is empty
 * for most Energy cards from TCGdex — see the isBasicEnergy doc comment
 * above — so this falls back to parsing the type word out of the name
 * itself ("Fire Energy" / "Basic Fire Energy" -> "Fire"), using the same
 * restricted type-name list so it can't misfire on a Special Energy
 * card's name. Returns null if no type can be determined either way.
 */
export function inferBasicEnergyType(card: Pick<Card, "types" | "name">): string | null {
  if (card.types.length > 0) return card.types[0] ?? null;
  const match = BASIC_ENERGY_NAME_PATTERN.exec(card.name);
  return match?.[2] ?? null;
}

export function isBasicPokemon(card: Pick<Card, "supertype" | "subtypes">): boolean {
  return card.supertype === "Pokémon" && card.subtypes.includes("Basic");
}

/**
 * The single, shared source of truth for "which elemental type icon(s)
 * should this card show" — used for both AI-facing data (review payload)
 * and on-screen display (card overlay, deck list, print page).
 *
 * `card.types` alone is reliable for Pokémon but empty for most real
 * Basic Energy cards from TCGdex (see isBasicEnergy's doc comment above),
 * so this falls back to `inferBasicEnergyType` for Energy cards whose
 * `types` is empty. Non-Energy cards with an empty `types` (e.g.
 * Trainers, or a Pokémon the provider genuinely has no type data for)
 * correctly resolve to an empty array — there's nothing to infer from a
 * name for those.
 *
 * Before this helper existed, several call sites each carried their own
 * ad-hoc copy of this same fallback (review-cards.ts, statistics.ts,
 * deck-quality.ts, candidate-pool-summary.ts), and three UI components
 * (CardImageModal, DeckCardList, the print page) read `card.types`
 * directly with no fallback at all — silently showing no type icon for
 * almost every Energy card. This consolidates all of them into one
 * implementation so a future fix only needs to happen once.
 */
export function resolveDisplayTypes(card: Pick<Card, "types" | "name" | "supertype">): string[] {
  if (card.types.length > 0) return card.types;
  if (card.supertype !== "Energy") return card.types;
  const inferred = inferBasicEnergyType(card);
  return inferred ? [inferred] : [];
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
