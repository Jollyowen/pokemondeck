import type { DeckCardEntry, DeckReviewResult } from "@/types/deck";

export function collectReferencedCardIds(
  result: DeckReviewResult,
  deckEntries: DeckCardEntry[],
): string[] {
  const ids = new Set<string>();
  for (const e of deckEntries) ids.add(e.cardId);
  for (const s of result.strengths) for (const id of s.evidenceCardIds) ids.add(id);
  for (const i of result.issues) for (const id of i.evidenceCardIds) ids.add(id);
  for (const swap of result.suggestedSwaps) {
    for (const r of swap.remove) ids.add(r.cardId);
    for (const a of swap.add) ids.add(a.cardId);
  }
  return [...ids];
}
