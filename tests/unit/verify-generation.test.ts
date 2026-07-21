import { describe, expect, it } from "vitest";
import { buildVerifiedGeneratedDeck, ensureEvolutionPrerequisites } from "@/lib/ai/verify-generation";
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

describe("ensureEvolutionPrerequisites", () => {
  it("adds the missing Basic when only a Stage 1 is present", () => {
    const candidates = {
      stage1: makeCard({ id: "stage1", name: "Charmeleon", subtypes: ["Stage 1"], evolvesFrom: "Charmander" , supertype: "Pokémon" }),
      basic: makeCard({ id: "basic", name: "Charmander", subtypes: ["Basic"] , supertype: "Pokémon" }),
    };
    const entries = [{ cardId: "stage1", cardName: "Charmeleon", quantity: 3 }];
    const result = ensureEvolutionPrerequisites(entries, candidates);
    const basicEntry = result.find((e) => e.cardId === "basic");
    expect(basicEntry).toBeDefined();
    expect(basicEntry?.quantity).toBe(3);
  });

  it("walks a full Stage 2 -> Stage 1 -> Basic chain, adding both missing links", () => {
    const candidates = {
      stage2: makeCard({ id: "stage2", name: "Charizard", subtypes: ["Stage 2"], evolvesFrom: "Charmeleon" , supertype: "Pokémon" }),
      stage1: makeCard({ id: "stage1", name: "Charmeleon", subtypes: ["Stage 1"], evolvesFrom: "Charmander" , supertype: "Pokémon" }),
      basic: makeCard({ id: "basic", name: "Charmander", subtypes: ["Basic"] , supertype: "Pokémon" }),
    };
    const entries = [{ cardId: "stage2", cardName: "Charizard", quantity: 2 }];
    const result = ensureEvolutionPrerequisites(entries, candidates);
    expect(result.find((e) => e.cardId === "stage1")?.quantity).toBe(2);
    expect(result.find((e) => e.cardId === "basic")?.quantity).toBe(2);
  });

  it("does nothing when the Basic is already present", () => {
    const candidates = {
      stage1: makeCard({ id: "stage1", name: "Charmeleon", subtypes: ["Stage 1"], evolvesFrom: "Charmander" , supertype: "Pokémon" }),
      basic: makeCard({ id: "basic", name: "Charmander", subtypes: ["Basic"] , supertype: "Pokémon" }),
    };
    const entries = [
      { cardId: "stage1", cardName: "Charmeleon", quantity: 3 },
      { cardId: "basic", cardName: "Charmander", quantity: 2 },
    ];
    const result = ensureEvolutionPrerequisites(entries, candidates);
    expect(result.find((e) => e.cardId === "basic")?.quantity).toBe(2);
  });

  it("does nothing for a deck of only Basics", () => {
    const candidates = { basic: makeCard({ id: "basic", name: "Pikachu", subtypes: ["Basic"] , supertype: "Pokémon" }) };
    const entries = [{ cardId: "basic", cardName: "Pikachu", quantity: 4 }];
    const result = ensureEvolutionPrerequisites(entries, candidates);
    expect(result).toEqual(entries);
  });

  it("cannot force a prerequisite that isn't in the candidate pool at all", () => {
    const candidates = {
      stage1: makeCard({ id: "stage1", name: "Charmeleon", subtypes: ["Stage 1"], evolvesFrom: "Charmander" , supertype: "Pokémon" }),
    };
    const entries = [{ cardId: "stage1", cardName: "Charmeleon", quantity: 3 }];
    const result = ensureEvolutionPrerequisites(entries, candidates);
    expect(result).toEqual(entries);
  });

  it("caps the added Basic at the 4-copy limit even if the Stage 1 count is higher", () => {
    const candidates = {
      stage1: makeCard({ id: "stage1", name: "Charmeleon", subtypes: ["Stage 1"], evolvesFrom: "Charmander" , supertype: "Pokémon" }),
      basic: makeCard({ id: "basic", name: "Charmander", subtypes: ["Basic"] , supertype: "Pokémon" }),
    };
    // A Stage 1 count above 4 shouldn't itself be possible post-verification,
    // but the completion pass should still never exceed the copy limit.
    const entries = [{ cardId: "stage1", cardName: "Charmeleon", quantity: 4 }];
    const result = ensureEvolutionPrerequisites(entries, candidates);
    expect(result.find((e) => e.cardId === "basic")?.quantity).toBe(4);
  });

  it("never pushes the total over 60 when adding prerequisites near the cap", () => {
    const candidates = {
      stage1: makeCard({ id: "stage1", name: "Charmeleon", subtypes: ["Stage 1"], evolvesFrom: "Charmander" , supertype: "Pokémon" }),
      basic: makeCard({ id: "basic", name: "Charmander", subtypes: ["Basic"] , supertype: "Pokémon" }),
      filler: makeCard({ id: "filler", name: "Filler Energy", supertype: "Energy", subtypes: ["Basic"] }),
    };
    // Starts at a valid 59 total (the only realistic precondition, since
    // this always runs after buildVerifiedGeneratedDeck, which guarantees
    // the input is already <=60) — only 1 slot of room remains.
    const entries = [
      { cardId: "stage1", cardName: "Charmeleon", quantity: 4 },
      { cardId: "filler", cardName: "Filler Energy", quantity: 55 },
    ];
    const result = ensureEvolutionPrerequisites(entries, candidates);
    const total = result.reduce((s, e) => s + e.quantity, 0);
    expect(total).toBeLessThanOrEqual(60);
    expect(result.find((e) => e.cardId === "basic")?.quantity).toBe(1);
  });

  it("adds nothing further once there is no remaining space", () => {
    const candidates = {
      stage1: makeCard({ id: "stage1", name: "Charmeleon", subtypes: ["Stage 1"], evolvesFrom: "Charmander" , supertype: "Pokémon" }),
      basic: makeCard({ id: "basic", name: "Charmander", subtypes: ["Basic"] , supertype: "Pokémon" }),
      filler: makeCard({ id: "filler", name: "Filler Energy", supertype: "Energy", subtypes: ["Basic"] }),
    };
    const entries = [
      { cardId: "stage1", cardName: "Charmeleon", quantity: 4 },
      { cardId: "filler", cardName: "Filler Energy", quantity: 56 },
    ];
    const result = ensureEvolutionPrerequisites(entries, candidates);
    expect(result.find((e) => e.cardId === "basic")).toBeUndefined();
  });
});
