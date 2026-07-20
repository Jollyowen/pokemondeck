import { createHash } from "crypto";
import type { DeckFormat } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";
import { VALIDATION_RULES_VERSION } from "@/lib/deck/validate";
import { REVIEW_PROMPT_VERSION } from "@/lib/ai/prompt";

/**
 * Deterministic: same deck contents + format always produce the same hash,
 * regardless of the order cards were added in. Bumping either version
 * constant (validation rules or prompt) invalidates every previously
 * cached review, since the review those hashes point to was computed
 * against different logic.
 */
export function computeDeckReviewHash(
  entries: DeckCardEntry[],
  format: DeckFormat,
  strategyArchetype: string | null,
  strategyNotes: string | null,
): string {
  const sorted = [...entries]
    .map((e) => `${e.cardId}:${e.quantity}`)
    .sort();

  const input = [
    sorted.join(","),
    format,
    `archetype:${strategyArchetype ?? ""}`,
    `notes:${strategyNotes ?? ""}`,
    `rules:${VALIDATION_RULES_VERSION}`,
    `prompt:${REVIEW_PROMPT_VERSION}`,
  ].join("|");

  return createHash("sha256").update(input).digest("hex");
}
