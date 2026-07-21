import { z } from "zod";

export const deckGenerationResultSchema = z.object({
  deckName: z.string().min(1).max(100),
  explanation: z.string().min(1),
  cards: z.array(
    z.object({
      cardId: z.string().min(1),
      count: z.number().int().positive(),
    }),
  ),
});

export type RawDeckGenerationResult = z.infer<typeof deckGenerationResultSchema>;

/**
 * Parses and schema-validates raw model output. Returns null on any
 * failure (malformed JSON, wrong shape) — the caller decides how to fail
 * safely, same discipline as parseAndValidateReviewOutput.
 */
export function parseAndValidateGenerationOutput(rawText: string): RawDeckGenerationResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  const result = deckGenerationResultSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
