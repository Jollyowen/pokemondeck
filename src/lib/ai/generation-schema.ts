import { z } from "zod";

const outerSchema = z.object({
  deckName: z.string().min(1).max(100),
  explanation: z.string().min(1),
  cards: z.array(z.unknown()),
});

const cardEntrySchema = z.object({
  cardId: z.string().min(1),
  count: z.number(),
});

export type RawDeckGenerationResult = {
  deckName: string;
  explanation: string;
  cards: Array<{ cardId: string; count: number }>;
};

/**
 * Parses and schema-validates raw model output. Returns null on any
 * genuine failure (malformed JSON, missing deckName/explanation, cards
 * not an array at all, or zero usable card entries surviving).
 *
 * Deliberately lenient at the individual card-entry level: a single
 * malformed entry (a non-positive/non-integer "count" -- the most likely
 * real case being the model zeroing out a card's count during a
 * refinement pass to signal "remove this" instead of omitting the entry
 * entirely, which the prompt doesn't explicitly forbid) is dropped rather
 * than failing the whole response. This matches the discipline already
 * used one layer downstream in buildVerifiedGeneratedDeck, which drops
 * hallucinated or invalid entries instead of rejecting the batch -- the
 * schema gate was stricter than the code that actually consumes its
 * output, which meant a single stray entry could turn a mostly-good
 * response into a hard failure surfaced to the user as
 * "AI_GENERATION_UNAVAILABLE".
 */
export function parseAndValidateGenerationOutput(rawText: string): RawDeckGenerationResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }

  const outer = outerSchema.safeParse(parsed);
  if (!outer.success) return null;

  const cards = outer.data.cards
    .map((item) => cardEntrySchema.safeParse(item))
    .filter((r): r is z.SafeParseSuccess<z.infer<typeof cardEntrySchema>> => r.success)
    .map((r) => r.data)
    .filter((c) => Number.isFinite(c.count) && c.count > 0)
    .map((c) => ({ cardId: c.cardId, count: Math.floor(c.count) }));

  // A response with deckName/explanation but literally no usable card
  // entries at all is still a genuine failure, not something worth
  // silently returning as an empty deck.
  if (cards.length === 0) return null;

  return { deckName: outer.data.deckName, explanation: outer.data.explanation, cards };
}
