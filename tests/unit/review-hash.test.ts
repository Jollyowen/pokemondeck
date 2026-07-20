import { describe, expect, it } from "vitest";
import { computeDeckReviewHash } from "@/lib/deck/review-hash";
import type { DeckCardEntry } from "@/types/deck";

const entries: DeckCardEntry[] = [
  { cardId: "a", cardName: "A", quantity: 4 },
  { cardId: "b", cardName: "B", quantity: 56 },
];

describe("computeDeckReviewHash", () => {
  it("is deterministic for identical input", () => {
    const h1 = computeDeckReviewHash(entries, "standard", null, "aggro");
    const h2 = computeDeckReviewHash(entries, "standard", null, "aggro");
    expect(h1).toBe(h2);
  });

  it("is independent of card order", () => {
    const reversed = [...entries].reverse();
    expect(computeDeckReviewHash(entries, "standard", null, null)).toBe(
      computeDeckReviewHash(reversed, "standard", null, null),
    );
  });

  it("changes when a card quantity changes", () => {
    const changed: DeckCardEntry[] = [{ cardId: "a", cardName: "A", quantity: 3 }, entries[1]!];
    expect(computeDeckReviewHash(entries, "standard", null, null)).not.toBe(
      computeDeckReviewHash(changed, "standard", null, null),
    );
  });

  it("changes when the format changes", () => {
    expect(computeDeckReviewHash(entries, "standard", null, null)).not.toBe(
      computeDeckReviewHash(entries, "expanded", null, null),
    );
  });

  it("changes when strategyArchetype changes", () => {
    expect(computeDeckReviewHash(entries, "standard", "aggro", null)).not.toBe(
      computeDeckReviewHash(entries, "standard", "control", null),
    );
  });

  it("changes when strategyNotes changes", () => {
    expect(computeDeckReviewHash(entries, "standard", null, "aggro")).not.toBe(
      computeDeckReviewHash(entries, "standard", null, "control"),
    );
  });

  it("treats null and empty-string strategyNotes as equivalent", () => {
    expect(computeDeckReviewHash(entries, "standard", null, null)).toBe(
      computeDeckReviewHash(entries, "standard", null, ""),
    );
  });
});
