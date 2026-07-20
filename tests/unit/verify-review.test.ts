import { describe, expect, it } from "vitest";
import { verifyReviewResult } from "@/lib/ai/verify-review";
import type { RawDeckReviewResult } from "@/lib/ai/review-schema";
import type { Card } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";

function makeCard(overrides: Partial<Card> & { id: string; name: string }): Card {
  return {
    provider: "pokemon_tcg_api",
    number: "1",
    setId: "set1",
    setName: "Set One",
    imageSmall: "",
    imageLarge: "",
    supertype: "Trainer",
    subtypes: [],
    types: [],
    hp: null,
    evolvesFrom: null,
    evolvesTo: [],
    price: null,
    rarity: null,
    abilities: [],
    attacks: [],
    weaknesses: [],
    resistances: [],
    retreatCost: [],
    convertedRetreatCost: 0,
    rules: [],
    legalities: { standard: "legal", expanded: "legal", unlimited: "legal" },
    ...overrides,
  };
}

function baseResult(overrides: Partial<RawDeckReviewResult> = {}): RawDeckReviewResult {
  return {
    summary: "Test summary",
    strengths: [],
    issues: [],
    suggestedSwaps: [],
    confidence: "medium",
    limitations: ["Strategic review based on the submitted deck and card text."],
    ...overrides,
  };
}

// A 60-card deck: 4 Trainer A, 56 Basic Energy, so removing 4 A and adding
// 4 B keeps the deck at exactly 60 and doesn't touch any copy limit.
function baseDeck() {
  const deckCardsById: Record<string, Card> = {
    "trainer-a": makeCard({ id: "trainer-a", name: "Trainer A" }),
    "energy-1": makeCard({ id: "energy-1", name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] }),
  };
  const entries: DeckCardEntry[] = [
    { cardId: "trainer-a", cardName: "Trainer A", quantity: 4 },
    { cardId: "energy-1", cardName: "Fire Energy", quantity: 56 },
  ];
  return { deckCardsById, entries };
}

describe("verifyReviewResult", () => {
  it("accepts a well-formed swap that preserves 60 cards and respects copy limits", () => {
    const { deckCardsById, entries } = baseDeck();
    const candidateCardsById: Record<string, Card> = {
      "trainer-b": makeCard({ id: "trainer-b", name: "Trainer B" }),
    };
    const raw = baseResult({
      suggestedSwaps: [
        {
          remove: [{ cardId: "trainer-a", count: 4 }],
          add: [{ cardId: "trainer-b", count: 4 }],
          reason: "Better consistency",
        },
      ],
    });

    const result = verifyReviewResult(raw, entries, deckCardsById, candidateCardsById, "all");
    expect(result.suggestedSwaps).toHaveLength(1);
  });

  it("rejects a swap that removes a card not actually in the deck", () => {
    const { deckCardsById, entries } = baseDeck();
    const candidateCardsById: Record<string, Card> = {
      "trainer-b": makeCard({ id: "trainer-b", name: "Trainer B" }),
    };
    const raw = baseResult({
      suggestedSwaps: [
        {
          remove: [{ cardId: "nonexistent-card", count: 4 }],
          add: [{ cardId: "trainer-b", count: 4 }],
          reason: "Invented removal",
        },
      ],
    });

    const result = verifyReviewResult(raw, entries, deckCardsById, candidateCardsById, "all");
    expect(result.suggestedSwaps).toHaveLength(0);
  });

  it("rejects a swap that adds a card outside the supplied candidate set (a hallucinated card)", () => {
    const { deckCardsById, entries } = baseDeck();
    const raw = baseResult({
      suggestedSwaps: [
        {
          remove: [{ cardId: "trainer-a", count: 4 }],
          add: [{ cardId: "invented-card-id", count: 4 }],
          reason: "Invented addition",
        },
      ],
    });

    const result = verifyReviewResult(raw, entries, deckCardsById, {}, "all");
    expect(result.suggestedSwaps).toHaveLength(0);
  });

  it("rejects a swap that would remove more copies than are actually present", () => {
    const { deckCardsById, entries } = baseDeck();
    const candidateCardsById: Record<string, Card> = {
      "trainer-b": makeCard({ id: "trainer-b", name: "Trainer B" }),
    };
    const raw = baseResult({
      suggestedSwaps: [
        {
          remove: [{ cardId: "trainer-a", count: 10 }],
          add: [{ cardId: "trainer-b", count: 10 }],
          reason: "Over-removal",
        },
      ],
    });

    const result = verifyReviewResult(raw, entries, deckCardsById, candidateCardsById, "all");
    expect(result.suggestedSwaps).toHaveLength(0);
  });

  it("rejects a swap that would change the deck away from exactly 60 cards", () => {
    const { deckCardsById, entries } = baseDeck();
    const candidateCardsById: Record<string, Card> = {
      "trainer-b": makeCard({ id: "trainer-b", name: "Trainer B" }),
    };
    const raw = baseResult({
      suggestedSwaps: [
        {
          remove: [{ cardId: "trainer-a", count: 2 }],
          add: [{ cardId: "trainer-b", count: 4 }],
          reason: "Unbalanced swap",
        },
      ],
    });

    const result = verifyReviewResult(raw, entries, deckCardsById, candidateCardsById, "all");
    expect(result.suggestedSwaps).toHaveLength(0);
  });

  it("rejects a swap that would exceed the 4-copy limit", () => {
    const { deckCardsById, entries } = baseDeck();
    const candidateCardsById: Record<string, Card> = {
      "trainer-b": makeCard({ id: "trainer-b", name: "Trainer B" }),
    };
    const raw = baseResult({
      suggestedSwaps: [
        {
          remove: [{ cardId: "energy-1", count: 5 }],
          add: [{ cardId: "trainer-b", count: 5 }],
          reason: "Too many copies",
        },
      ],
    });

    const result = verifyReviewResult(raw, entries, deckCardsById, candidateCardsById, "all");
    expect(result.suggestedSwaps).toHaveLength(0);
  });

  it("rejects a swap that adds a card illegal in the selected format", () => {
    const { deckCardsById, entries } = baseDeck();
    const candidateCardsById: Record<string, Card> = {
      "trainer-b": makeCard({
        id: "trainer-b",
        name: "Trainer B",
        legalities: { standard: "not_legal", expanded: "legal", unlimited: "legal" },
      }),
    };
    const raw = baseResult({
      suggestedSwaps: [
        {
          remove: [{ cardId: "trainer-a", count: 4 }],
          add: [{ cardId: "trainer-b", count: 4 }],
          reason: "Illegal in standard",
        },
      ],
    });

    const result = verifyReviewResult(raw, entries, deckCardsById, candidateCardsById, "standard");
    expect(result.suggestedSwaps).toHaveLength(0);
  });

  it("allows a format-illegal candidate when format is 'all' (no restriction)", () => {
    const { deckCardsById, entries } = baseDeck();
    const candidateCardsById: Record<string, Card> = {
      "trainer-b": makeCard({
        id: "trainer-b",
        name: "Trainer B",
        legalities: { standard: "not_legal", expanded: "not_legal", unlimited: "legal" },
      }),
    };
    const raw = baseResult({
      suggestedSwaps: [
        {
          remove: [{ cardId: "trainer-a", count: 4 }],
          add: [{ cardId: "trainer-b", count: 4 }],
          reason: "Fine under 'all'",
        },
      ],
    });

    const result = verifyReviewResult(raw, entries, deckCardsById, candidateCardsById, "all");
    expect(result.suggestedSwaps).toHaveLength(1);
  });

  it("strips evidenceCardIds that don't correspond to a real supplied card, without dropping the whole issue", () => {
    const { deckCardsById, entries } = baseDeck();
    const raw = baseResult({
      issues: [
        {
          category: "consistency",
          severity: "medium",
          title: "Test issue",
          explanation: "Explanation",
          evidenceCardIds: ["trainer-a", "hallucinated-id"],
        },
      ],
    });

    const result = verifyReviewResult(raw, entries, deckCardsById, {}, "all");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.evidenceCardIds).toEqual(["trainer-a"]);
  });

  it("keeps multiple independent swaps and only rejects the invalid one", () => {
    const { deckCardsById, entries } = baseDeck();
    const candidateCardsById: Record<string, Card> = {
      "trainer-b": makeCard({ id: "trainer-b", name: "Trainer B" }),
    };
    const raw = baseResult({
      suggestedSwaps: [
        {
          remove: [{ cardId: "trainer-a", count: 4 }],
          add: [{ cardId: "trainer-b", count: 4 }],
          reason: "Valid swap",
        },
        {
          remove: [{ cardId: "trainer-a", count: 4 }],
          add: [{ cardId: "nonexistent", count: 4 }],
          reason: "Invalid swap",
        },
      ],
    });

    const result = verifyReviewResult(raw, entries, deckCardsById, candidateCardsById, "all");
    expect(result.suggestedSwaps).toHaveLength(1);
    expect(result.suggestedSwaps[0]?.reason).toBe("Valid swap");
  });
});
