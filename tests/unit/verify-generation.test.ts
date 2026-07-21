import { describe, expect, it } from "vitest";
import { buildVerifiedGeneratedDeck } from "@/lib/ai/verify-generation";
import type { Card } from "@/types/card";

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
    abilities: [],
    attacks: [],
    weaknesses: [],
    resistances: [],
    retreatCost: [],
    convertedRetreatCost: 0,
    rules: [],
    rarity: null,
    legalities: { standard: "legal", expanded: "legal", unlimited: "legal" },
    price: null,
    ...overrides,
  };
}

describe("buildVerifiedGeneratedDeck", () => {
  it("builds a deck from valid raw entries", () => {
    const candidates = {
      a: makeCard({ id: "a", name: "Trainer A" }),
      b: makeCard({ id: "b", name: "Energy B", supertype: "Energy", subtypes: ["Basic"] }),
    };
    const result = buildVerifiedGeneratedDeck(
      [
        { cardId: "a", count: 4 },
        { cardId: "b", count: 56 },
      ],
      candidates,
    );
    expect(result).toEqual([
      { cardId: "a", cardName: "Trainer A", quantity: 4 },
      { cardId: "b", cardName: "Energy B", quantity: 56 },
    ]);
  });

  it("drops a hallucinated card ID outside the candidate pool entirely", () => {
    const candidates = { a: makeCard({ id: "a", name: "Trainer A" }) };
    const result = buildVerifiedGeneratedDeck(
      [
        { cardId: "a", count: 4 },
        { cardId: "invented-id", count: 10 },
      ],
      candidates,
    );
    expect(result).toEqual([{ cardId: "a", cardName: "Trainer A", quantity: 4 }]);
  });

  it("never exceeds the 4-copy limit for a non-energy card, even if the model asks for more", () => {
    const candidates = { a: makeCard({ id: "a", name: "Trainer A" }) };
    const result = buildVerifiedGeneratedDeck([{ cardId: "a", count: 10 }], candidates);
    expect(result).toEqual([{ cardId: "a", cardName: "Trainer A", quantity: 4 }]);
  });

  it("allows unlimited Basic Energy copies", () => {
    const candidates = { e: makeCard({ id: "e", name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] }) };
    const result = buildVerifiedGeneratedDeck([{ cardId: "e", count: 20 }], candidates);
    expect(result).toEqual([{ cardId: "e", cardName: "Fire Energy", quantity: 20 }]);
  });

  it("enforces the copy limit across different printings sharing the same name", () => {
    const candidates = {
      p1: makeCard({ id: "p1", name: "Charizard" }),
      p2: makeCard({ id: "p2", name: "Charizard" }),
    };
    const result = buildVerifiedGeneratedDeck(
      [
        { cardId: "p1", count: 3 },
        { cardId: "p2", count: 3 },
      ],
      candidates,
    );
    const total = result.reduce((s, e) => s + e.quantity, 0);
    expect(total).toBe(4);
  });

  it("never exceeds 60 total cards, truncating an overshooting entry rather than dropping it", () => {
    const candidates = { e: makeCard({ id: "e", name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] }) };
    const result = buildVerifiedGeneratedDeck([{ cardId: "e", count: 65 }], candidates);
    expect(result).toEqual([{ cardId: "e", cardName: "Fire Energy", quantity: 60 }]);
  });

  it("stops adding cards once the running total reaches 60", () => {
    const candidates = {
      e: makeCard({ id: "e", name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] }),
      t: makeCard({ id: "t", name: "Trainer A" }),
    };
    const result = buildVerifiedGeneratedDeck(
      [
        { cardId: "e", count: 60 },
        { cardId: "t", count: 4 },
      ],
      candidates,
    );
    expect(result).toEqual([{ cardId: "e", cardName: "Fire Energy", quantity: 60 }]);
  });

  it("never pads a short result up to 60 — an under-60 result stays under 60", () => {
    const candidates = { a: makeCard({ id: "a", name: "Trainer A" }) };
    const result = buildVerifiedGeneratedDeck([{ cardId: "a", count: 4 }], candidates);
    const total = result.reduce((s, e) => s + e.quantity, 0);
    expect(total).toBe(4);
  });

  it("ignores non-positive or non-finite counts", () => {
    const candidates = { a: makeCard({ id: "a", name: "Trainer A" }) };
    const result = buildVerifiedGeneratedDeck(
      [
        { cardId: "a", count: 0 },
        { cardId: "a", count: -5 },
        { cardId: "a", count: Number.NaN },
      ],
      candidates,
    );
    expect(result).toEqual([]);
  });

  it("merges duplicate references to the same card ID in the model's own output", () => {
    const candidates = { a: makeCard({ id: "a", name: "Trainer A" }) };
    const result = buildVerifiedGeneratedDeck(
      [
        { cardId: "a", count: 2 },
        { cardId: "a", count: 1 },
      ],
      candidates,
    );
    expect(result).toEqual([{ cardId: "a", cardName: "Trainer A", quantity: 3 }]);
  });

  it("respects a special same-name copy limit below 4", () => {
    const candidates = {
      ace: makeCard({
        id: "ace",
        name: "Computer Search",
        rules: ["You may only have 1 of this card in your deck."],
      }),
    };
    const result = buildVerifiedGeneratedDeck([{ cardId: "ace", count: 3 }], candidates);
    expect(result).toEqual([{ cardId: "ace", cardName: "Computer Search", quantity: 1 }]);
  });
});
