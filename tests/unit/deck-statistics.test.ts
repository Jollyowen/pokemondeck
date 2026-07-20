import { describe, expect, it } from "vitest";
import { computeDeckStatistics } from "@/lib/deck/statistics";
import { isDrawSupportCard, isSearchSupportCard } from "@/lib/deck/text-heuristics";
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
    supertype: "Pokémon",
    subtypes: ["Basic"],
    types: [],
    hp: 100,
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

describe("computeDeckStatistics", () => {
  it("totals Pokémon, Trainer and Energy counts by quantity, not by distinct card", () => {
    const cards = {
      p1: makeCard({ id: "p1", name: "Pikachu", supertype: "Pokémon" }),
      t1: makeCard({ id: "t1", name: "Poké Ball", supertype: "Trainer" }),
      e1: makeCard({ id: "e1", name: "Fire Energy", supertype: "Energy" }),
    };
    const entries: DeckCardEntry[] = [
      { cardId: "p1", cardName: "Pikachu", quantity: 3 },
      { cardId: "t1", cardName: "Poké Ball", quantity: 4 },
      { cardId: "e1", cardName: "Fire Energy", quantity: 10 },
    ];
    const stats = computeDeckStatistics(entries, cards, "all");
    expect(stats.totalPokemon).toBe(3);
    expect(stats.totalTrainer).toBe(4);
    expect(stats.totalEnergy).toBe(10);
  });

  it("distributes Pokémon type counts by quantity, including dual types", () => {
    const cards = {
      p1: makeCard({ id: "p1", name: "Charizard", supertype: "Pokémon", types: ["Fire", "Flying"] }),
    };
    const entries: DeckCardEntry[] = [{ cardId: "p1", cardName: "Charizard", quantity: 2 }];
    const stats = computeDeckStatistics(entries, cards, "all");
    expect(stats.pokemonTypeDistribution).toEqual({ Fire: 2, Flying: 2 });
  });

  it("distributes energy type counts separately from Pokémon types", () => {
    const cards = {
      e1: makeCard({ id: "e1", name: "Water Energy", supertype: "Energy", subtypes: ["Basic"], types: ["Water"] }),
    };
    const entries: DeckCardEntry[] = [{ cardId: "e1", cardName: "Water Energy", quantity: 12 }];
    const stats = computeDeckStatistics(entries, cards, "all");
    expect(stats.energyTypeDistribution).toEqual({ Water: 12 });
    expect(stats.pokemonTypeDistribution).toEqual({});
  });

  it("buckets evolution stages correctly, including an 'other' bucket for unmatched subtypes", () => {
    const cards = {
      basic: makeCard({ id: "basic", name: "Charmander", subtypes: ["Basic"] }),
      s1: makeCard({ id: "s1", name: "Charmeleon", subtypes: ["Stage 1"] }),
      s2: makeCard({ id: "s2", name: "Charizard", subtypes: ["Stage 2"] }),
      other: makeCard({ id: "other", name: "Mysterious Pokémon", subtypes: ["Restored"] }),
    };
    const entries: DeckCardEntry[] = [
      { cardId: "basic", cardName: "Charmander", quantity: 4 },
      { cardId: "s1", cardName: "Charmeleon", quantity: 3 },
      { cardId: "s2", cardName: "Charizard", quantity: 2 },
      { cardId: "other", cardName: "Mysterious Pokémon", quantity: 1 },
    ];
    const stats = computeDeckStatistics(entries, cards, "all");
    expect(stats.evolutionStageDistribution).toEqual({ basic: 4, stage1: 3, stage2: 2, other: 1 });
  });

  it("computes the quantity-weighted average retreat cost across Pokémon only", () => {
    const cards = {
      p1: makeCard({ id: "p1", name: "A", convertedRetreatCost: 0 }),
      p2: makeCard({ id: "p2", name: "B", convertedRetreatCost: 4 }),
    };
    const entries: DeckCardEntry[] = [
      { cardId: "p1", cardName: "A", quantity: 3 },
      { cardId: "p2", cardName: "B", quantity: 1 },
    ];
    // (0*3 + 4*1) / 4 = 1
    const stats = computeDeckStatistics(entries, cards, "all");
    expect(stats.averageRetreatCost).toBe(1);
  });

  it("returns an average retreat cost of 0 when there are no Pokémon", () => {
    const cards = { t1: makeCard({ id: "t1", name: "Trainer", supertype: "Trainer" }) };
    const entries: DeckCardEntry[] = [{ cardId: "t1", cardName: "Trainer", quantity: 4 }];
    const stats = computeDeckStatistics(entries, cards, "all");
    expect(stats.averageRetreatCost).toBe(0);
  });

  it("builds an attack energy-cost distribution weighted by card quantity", () => {
    const cards = {
      p1: makeCard({
        id: "p1",
        name: "Attacker",
        attacks: [
          { name: "Quick Attack", cost: ["Colorless"], convertedEnergyCost: 1, damage: "10", text: "" },
          { name: "Big Attack", cost: ["Fire", "Fire"], convertedEnergyCost: 2, damage: "60", text: "" },
        ],
      }),
    };
    const entries: DeckCardEntry[] = [{ cardId: "p1", cardName: "Attacker", quantity: 3 }];
    const stats = computeDeckStatistics(entries, cards, "all");
    expect(stats.attackEnergyCostDistribution).toEqual({ 1: 3, 2: 3 });
  });

  it("counts format-illegal cards by quantity, and reports 0 when format is 'all'", () => {
    const cards = {
      p1: makeCard({
        id: "p1",
        name: "Illegal Card",
        legalities: { standard: "not_legal", expanded: "legal", unlimited: "legal" },
      }),
    };
    const entries: DeckCardEntry[] = [{ cardId: "p1", cardName: "Illegal Card", quantity: 4 }];
    expect(computeDeckStatistics(entries, cards, "standard").formatIllegalCount).toBe(4);
    expect(computeDeckStatistics(entries, cards, "all").formatIllegalCount).toBe(0);
  });

  it("excludes unresolved cards from tallies rather than throwing", () => {
    const entries: DeckCardEntry[] = [{ cardId: "missing", cardName: "Ghost Card", quantity: 4 }];
    const stats = computeDeckStatistics(entries, {}, "all");
    expect(stats.totalPokemon).toBe(0);
    expect(stats.totalTrainer).toBe(0);
    expect(stats.totalEnergy).toBe(0);
  });

  it("flags drawSupportCount and searchSupportCount as estimated fields", () => {
    const stats = computeDeckStatistics([], {}, "all");
    expect(stats.estimatedFields).toEqual(
      expect.arrayContaining(["drawSupportCount", "searchSupportCount"]),
    );
  });

  it("counts draw-support and search-support cards by quantity", () => {
    const cards = {
      draw: makeCard({
        id: "draw",
        name: "Professor's Research",
        supertype: "Trainer",
        rules: ["Discard your hand and draw 7 cards."],
      }),
      search: makeCard({
        id: "search",
        name: "Ultra Ball",
        supertype: "Trainer",
        rules: ["Search your deck for a Pokémon and put it into your hand."],
      }),
    };
    const entries: DeckCardEntry[] = [
      { cardId: "draw", cardName: "Professor's Research", quantity: 4 },
      { cardId: "search", cardName: "Ultra Ball", quantity: 3 },
    ];
    const stats = computeDeckStatistics(entries, cards, "all");
    expect(stats.drawSupportCount).toBe(4);
    expect(stats.searchSupportCount).toBe(3);
  });
});

describe("text heuristics", () => {
  it("does not flag ordinary cards as draw or search support", () => {
    const card = makeCard({ id: "x", name: "Basic Attacker", rules: [] });
    expect(isDrawSupportCard(card)).toBe(false);
    expect(isSearchSupportCard(card)).toBe(false);
  });

  it("detects draw support from ability text, not just rules text", () => {
    const card = makeCard({
      id: "x",
      name: "Drawer",
      abilities: [{ name: "Card Draw", text: "Once during your turn, you may draw a card.", type: "Ability" }],
    });
    expect(isDrawSupportCard(card)).toBe(true);
  });
});
