import { describe, expect, it } from "vitest";
import { normalizeCard, mapLegality, buildSearchQuery } from "@/lib/providers/pokemon-tcg-api";

describe("mapLegality", () => {
  it("maps 'Legal' to legal", () => {
    expect(mapLegality("Legal")).toBe("legal");
  });
  it("maps 'Banned' to not_legal", () => {
    expect(mapLegality("Banned")).toBe("not_legal");
  });
  it("maps an absent value to not_legal", () => {
    expect(mapLegality(undefined)).toBe("not_legal");
  });
});

describe("normalizeCard", () => {
  it("maps a fully-populated raw card", () => {
    const card = normalizeCard({
      id: "swsh1-1",
      name: "Charizard",
      number: "1",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      types: ["Fire"],
      hp: "170",
      evolvesFrom: "Charmeleon",
      evolvesTo: ["Mega Charizard X", "Mega Charizard Y"],
      abilities: [{ name: "Fire Spin", text: "Deal damage.", type: "Ability" }],
      attacks: [
        { name: "Flame Burst", cost: ["Fire", "Fire"], convertedEnergyCost: 2, damage: "60", text: "" },
      ],
      weaknesses: [{ type: "Water", value: "×2" }],
      resistances: [],
      retreatCost: ["Colorless", "Colorless"],
      convertedRetreatCost: 2,
      rules: [],
      set: { id: "swsh1", name: "Sword & Shield", series: "Sword & Shield", releaseDate: "2020/02/07" },
      images: { small: "small.png", large: "large.png" },
      legalities: { standard: "Legal", expanded: "Legal" },
    });

    expect(card).toMatchObject({
      id: "swsh1-1",
      provider: "pokemon_tcg_api",
      name: "Charizard",
      hp: 170,
      evolvesFrom: "Charmeleon",
      evolvesTo: ["Mega Charizard X", "Mega Charizard Y"],
      setId: "swsh1",
      legalities: { standard: "legal", expanded: "legal", unlimited: "not_legal" },
    });
  });

  it("normalises missing fields to empty arrays or null, never undefined", () => {
    const card = normalizeCard({ id: "x", name: "Mystery Card" });

    expect(card.subtypes).toEqual([]);
    expect(card.types).toEqual([]);
    expect(card.abilities).toEqual([]);
    expect(card.attacks).toEqual([]);
    expect(card.weaknesses).toEqual([]);
    expect(card.resistances).toEqual([]);
    expect(card.retreatCost).toEqual([]);
    expect(card.rules).toEqual([]);
    expect(card.hp).toBeNull();
    expect(card.evolvesFrom).toBeNull();
    expect(card.evolvesTo).toEqual([]);
    expect(card.imageSmall).toBe("");
    expect(card.setId).toBe("");
  });

  it("parses hp as a number", () => {
    const card = normalizeCard({ id: "x", name: "Test", hp: "120" });
    expect(card.hp).toBe(120);
  });
});

describe("buildSearchQuery", () => {
  it("builds a wildcard prefix query for a single-word name", () => {
    expect(buildSearchQuery({ name: "char" })).toBe("name:char*");
  });

  it("builds a quoted phrase query for a multi-word name", () => {
    expect(buildSearchQuery({ name: "venusaur v" })).toBe('name:"venusaur v"');
  });

  it("combines multiple filters", () => {
    const query = buildSearchQuery({
      name: "pikachu",
      supertype: "Pokémon",
      pokemonType: "Lightning",
      setId: "swsh1",
      rarity: "Rare Holo",
    });
    expect(query).toBe(
      'name:pikachu* supertype:"Pokémon" types:Lightning set.id:swsh1 rarity:"Rare Holo"',
    );
  });

  it("never includes a format clause, since format filtering is client-side only", () => {
    const query = buildSearchQuery({ name: "pikachu", format: "standard" });
    expect(query).not.toContain("legalities");
  });

  it("returns an empty string when no filters are given", () => {
    expect(buildSearchQuery({})).toBe("");
  });
});
