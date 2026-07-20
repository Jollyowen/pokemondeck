import { describe, expect, it } from "vitest";
import { computeEstimatedDeckValue } from "@/lib/deck/deck-value";
import type { Card } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";

function makeCard(id: string, name: string, market: number | null): Card {
  return {
    id,
    provider: "pokemon_tcg_api",
    name,
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
    legalities: { standard: "legal", expanded: "legal", unlimited: "legal" },
    price:
      market === null
        ? null
        : { variant: "normal", market, low: null, high: null, currency: "USD", url: null, updatedAt: null },
  };
}

describe("computeEstimatedDeckValue", () => {
  it("sums price times quantity across entries", () => {
    const cardsById = { a: makeCard("a", "A", 2), b: makeCard("b", "B", 0.5) };
    const entries: DeckCardEntry[] = [
      { cardId: "a", cardName: "A", quantity: 4 },
      { cardId: "b", cardName: "B", quantity: 10 },
    ];
    const result = computeEstimatedDeckValue(entries, cardsById);
    expect(result?.total).toBeCloseTo(13);
  });

  it("returns null when no card in the deck has price data at all", () => {
    const cardsById = { a: makeCard("a", "A", null) };
    const entries: DeckCardEntry[] = [{ cardId: "a", cardName: "A", quantity: 4 }];
    expect(computeEstimatedDeckValue(entries, cardsById)).toBeNull();
  });

  it("counts unpriced entries separately rather than treating them as free", () => {
    const cardsById = { a: makeCard("a", "A", 2), b: makeCard("b", "B", null) };
    const entries: DeckCardEntry[] = [
      { cardId: "a", cardName: "A", quantity: 4 },
      { cardId: "b", cardName: "B", quantity: 10 },
    ];
    const result = computeEstimatedDeckValue(entries, cardsById);
    expect(result?.total).toBeCloseTo(8);
    expect(result?.missingPriceCount).toBe(1);
  });

  it("treats an unresolved card the same as a missing price", () => {
    const entries: DeckCardEntry[] = [{ cardId: "unknown", cardName: "?", quantity: 4 }];
    expect(computeEstimatedDeckValue(entries, {})).toBeNull();
  });
});
