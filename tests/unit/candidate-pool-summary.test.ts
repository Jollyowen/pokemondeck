import { describe, expect, it } from "vitest";
import { buildCandidatePoolSummary } from "@/lib/ai/candidate-pool-summary";
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

describe("buildCandidatePoolSummary", () => {
  it("counts draw and search support candidates separately from other trainers", () => {
    const draw = makeCard({ id: "draw", name: "Research", rules: ["Draw 7 cards."] });
    const search = makeCard({ id: "search", name: "Ball", rules: ["Search your deck for a Pokémon."] });
    const other = makeCard({ id: "other", name: "Belt" });
    const target = makeCard({ id: "target", name: "Wailord", supertype: "Pokémon", evolvesFrom: "Wailmer" });

    const summary = buildCandidatePoolSummary([draw, search, other], target);
    expect(summary.drawSupportCandidates).toBe(1);
    expect(summary.searchSupportCandidates).toBe(1);
    expect(summary.otherTrainerCandidates).toBe(1);
  });

  it("counts Pokémon candidates by type", () => {
    const p1 = makeCard({ id: "p1", name: "A", supertype: "Pokémon", types: ["Water"] });
    const p2 = makeCard({ id: "p2", name: "B", supertype: "Pokémon", types: ["Water", "Fire"] });
    const target = makeCard({ id: "target", name: "Wailord", supertype: "Pokémon" });

    const summary = buildCandidatePoolSummary([p1, p2], target);
    expect(summary.pokemonCandidatesByType).toEqual({ Water: 2, Fire: 1 });
  });

  it("lists available Basic Energy types", () => {
    const e1 = makeCard({ id: "e1", name: "Water Energy", supertype: "Energy", subtypes: ["Basic"], types: ["Water"] });
    const e2 = makeCard({ id: "e2", name: "Special Energy", supertype: "Energy", subtypes: ["Special"], types: ["Fire"] });
    const target = makeCard({ id: "target", name: "Wailord", supertype: "Pokémon" });

    const summary = buildCandidatePoolSummary([e1, e2], target);
    expect(summary.energyTypesAvailable).toEqual(["Water"]);
  });

  it("lists which of the target's evolution-line names are actually available", () => {
    const wailmer = makeCard({ id: "wailmer", name: "Wailmer", supertype: "Pokémon" });
    const target = makeCard({ id: "target", name: "Wailord", supertype: "Pokémon", evolvesFrom: "Wailmer" });

    const summary = buildCandidatePoolSummary([wailmer], target);
    expect(summary.evolutionLineNamesAvailable).toEqual(["Wailmer"]);
  });

  it("excludes evolution-line names that aren't actually in the candidate pool", () => {
    const target = makeCard({ id: "target", name: "Wailord", supertype: "Pokémon", evolvesFrom: "Wailmer" });
    const summary = buildCandidatePoolSummary([], target);
    expect(summary.evolutionLineNamesAvailable).toEqual([]);
  });
});
