import { describe, expect, it } from "vitest";
import { toDeckReviewCard } from "@/lib/deck/review-cards";
import type { Card } from "@/types/card";

function makeCard(overrides: Partial<Card> & { id: string; name: string }): Card {
  return {
    provider: "tcgdex",
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
    abilities: [],
    attacks: [],
    weaknesses: [],
    resistances: [],
    retreatCost: [],
    convertedRetreatCost: 0,
    rules: [],
    rarity: null,
    legalities: { standard: "legal", expanded: "legal", unlimited: "unknown" },
    price: null,
    ...overrides,
  };
}

describe("toDeckReviewCard", () => {
  it("passes through card.types unchanged for Pokémon cards", () => {
    const card = makeCard({ id: "p1", name: "Charizard", supertype: "Pokémon", types: ["Fire", "Flying"] });
    const reviewCard = toDeckReviewCard(card, 1, "all");
    expect(reviewCard.types).toEqual(["Fire", "Flying"]);
  });

  it("passes through card.types unchanged for an Energy card when it's actually populated", () => {
    const card = makeCard({ id: "e1", name: "Water Energy", supertype: "Energy", types: ["Water"] });
    const reviewCard = toDeckReviewCard(card, 1, "all");
    expect(reviewCard.types).toEqual(["Water"]);
  });

  it("infers the type from name for a Basic Energy card whose types is empty (real TCGdex shape)", () => {
    // Regression test: before this fix, the AI review payload sent
    // types: [] for a card literally named "Fire Energy", leaving the
    // model to infer the type from the name on its own rather than the
    // app supplying it reliably up front.
    const card = makeCard({ id: "e2", name: "Fire Energy", supertype: "Energy", subtypes: ["Normal"], types: [] });
    const reviewCard = toDeckReviewCard(card, 1, "all");
    expect(reviewCard.types).toEqual(["Fire"]);
  });

  it("leaves types empty for a card with no inferable type (e.g. a real Special Energy with no type data)", () => {
    const card = makeCard({ id: "e3", name: "Rainbow Energy", supertype: "Energy", subtypes: [], types: [] });
    const reviewCard = toDeckReviewCard(card, 1, "all");
    expect(reviewCard.types).toEqual([]);
  });
});
