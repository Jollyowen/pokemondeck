import { z } from "zod";

const swapCardRefSchema = z.object({
  cardId: z.string().min(1),
  count: z.number().int().positive(),
});

export const deckReviewResultSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(
    z.object({
      title: z.string().min(1),
      explanation: z.string().min(1),
      evidenceCardIds: z.array(z.string()),
    }),
  ),
  issues: z.array(
    z.object({
      category: z.enum([
        "strategy",
        "consistency",
        "energy",
        "evolution",
        "draw_search",
        "legality",
        "retreat",
        "other",
      ]),
      severity: z.enum(["low", "medium", "high"]),
      title: z.string().min(1),
      explanation: z.string().min(1),
      evidenceCardIds: z.array(z.string()),
    }),
  ),
  suggestedSwaps: z.array(
    z.object({
      remove: z.array(swapCardRefSchema),
      add: z.array(swapCardRefSchema),
      reason: z.string().min(1),
    }),
  ),
  confidence: z.enum(["low", "medium", "high"]),
  limitations: z.array(z.string()),
});

export type RawDeckReviewResult = z.infer<typeof deckReviewResultSchema>;

/**
 * Parses a model's raw text response as JSON and validates it against the
 * required shape. Returns null on any failure (malformed JSON, wrong
 * shape, wrong types) rather than throwing — the caller decides how to
 * fail safely (e.g. surfacing a friendly error, never rendering
 * partially-invalid AI output).
 */
export function parseAndValidateReviewOutput(rawText: string): RawDeckReviewResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }

  const result = deckReviewResultSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
