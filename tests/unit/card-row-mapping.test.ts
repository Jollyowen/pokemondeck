import { describe, expect, it } from "vitest";
import { cardToRow, rowToCard, setToRow, rowToSet } from "@/lib/cards/card-row-mapping";
import type { Card, CardSet } from "@/types/card";

function makeCard(overrides: Partial<Card> & { id: string; name: string }): Card {
  return {
    provider: "pokemon_tcg_api",
    number: "1",
    setId: "swsh1",
    setName: "Sword & Shield",
    imageSmall: "https://images.pokemontcg.io/swsh1/1.png",
    imageLarge: "https://images.pokemontcg.io/swsh1/1_hires.png",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    types: ["Fire"],
    hp: 170,
    evolvesFrom: null,
    evolvesTo: ["Mega Charizard X"],
    abilities: [{ name: "Fire Spin", text: "Deal damage.", type: "Ability" }],
    attacks: [
      { name: "Flame Burst", cost: ["Fire", "Fire"], convertedEnergyCost: 2, damage: "60", text: "" },
    ],
    weaknesses: [{ type: "Water", value: "×2" }],
    resistances: [{ type: "Grass", value: "-30" }],
    retreatCost: ["Colorless", "Colorless"],
    convertedRetreatCost: 2,
    rules: ["Some rule text."],
    rarity: "Rare Holo",
    legalities: { standard: "legal", expanded: "not_legal", unlimited: "legal" },
    price: { variant: "normal", market: 4.5, low: 2, high: 10, currency: "USD", url: null, updatedAt: null },
    ...overrides,
  };
}

describe("cardToRow / rowToCard round-trip", () => {
  it("preserves every field through a full round trip", () => {
    const card = makeCard({ id: "swsh1-1", name: "Charizard" });
    const row = cardToRow(card, "2020/02/07");
    const roundTripped = rowToCard(row);
    expect(roundTripped).toEqual(card);
  });

  it("preserves a card with null/empty optional fields", () => {
    const card = makeCard({
      id: "x",
      name: "Mystery",
      evolvesFrom: null,
      evolvesTo: [],
      rarity: null,
      hp: null,
      number: "",
      price: null,
      abilities: [],
      attacks: [],
      weaknesses: [],
      resistances: [],
      retreatCost: [],
      rules: [],
    });
    const row = cardToRow(card, "2020/02/07");
    const roundTripped = rowToCard(row);
    expect(roundTripped).toEqual(card);
  });

  it("stores the set release date on the row for ordering, separate from the card itself", () => {
    const card = makeCard({ id: "swsh1-1", name: "Charizard" });
    const row = cardToRow(card, "2020/02/07");
    expect(row.set_release_date).toBe("2020/02/07");
  });
});

describe("setToRow / rowToSet round-trip", () => {
  it("preserves every field through a full round trip", () => {
    const set: CardSet = { id: "swsh1", name: "Sword & Shield", series: "Sword & Shield", releaseDate: "2020/02/07" };
    const row = setToRow(set);
    const roundTripped = rowToSet(row);
    expect(roundTripped).toEqual(set);
  });
});
