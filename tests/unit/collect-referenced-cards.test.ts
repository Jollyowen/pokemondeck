import { describe, expect, it } from "vitest";
import { collectReferencedCardIds } from "@/lib/ai/collect-referenced-cards";
import type { DeckReviewResult } from "@/types/deck";
import type { DeckCardEntry } from "@/types/deck";

function result(overrides: Partial<DeckReviewResult> = {}): DeckReviewResult {
  return {
    summary: "",
    strengths: [],
    issues: [],
    suggestedSwaps: [],
    confidence: "medium",
    limitations: [],
    ...overrides,
  };
}

describe("collectReferencedCardIds", () => {
  it("includes deck entries even if the result references nothing", () => {
    const entries: DeckCardEntry[] = [{ cardId: "a", cardName: "A", quantity: 4 }];
    expect(collectReferencedCardIds(result(), entries)).toEqual(["a"]);
  });

  it("includes evidence card IDs from strengths and issues", () => {
    const r = result({
      strengths: [{ title: "t", explanation: "e", evidenceCardIds: ["s1"] }],
      issues: [{ category: "other", severity: "low", title: "t", explanation: "e", evidenceCardIds: ["i1"] }],
    });
    const ids = collectReferencedCardIds(r, []);
    expect(ids).toEqual(expect.arrayContaining(["s1", "i1"]));
  });

  it("includes both remove and add card IDs from suggested swaps", () => {
    const r = result({
      suggestedSwaps: [
        { remove: [{ cardId: "rm1", count: 1 }], add: [{ cardId: "ad1", count: 1 }], reason: "x" },
      ],
    });
    const ids = collectReferencedCardIds(r, []);
    expect(ids).toEqual(expect.arrayContaining(["rm1", "ad1"]));
  });

  it("de-duplicates IDs that appear in multiple places", () => {
    const entries: DeckCardEntry[] = [{ cardId: "a", cardName: "A", quantity: 4 }];
    const r = result({
      strengths: [{ title: "t", explanation: "e", evidenceCardIds: ["a"] }],
    });
    expect(collectReferencedCardIds(r, entries)).toEqual(["a"]);
  });
});
