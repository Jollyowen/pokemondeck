import { describe, expect, it } from "vitest";
import { getEvolutionLineNames } from "@/lib/deck/evolution-line";

describe("getEvolutionLineNames", () => {
  it("includes both evolvesFrom and evolvesTo", () => {
    expect(getEvolutionLineNames({ evolvesFrom: "Wartortle", evolvesTo: ["Mega Blastoise"] })).toEqual([
      "Wartortle",
      "Mega Blastoise",
    ]);
  });

  it("omits evolvesFrom when the card is a Basic Pokémon", () => {
    expect(getEvolutionLineNames({ evolvesFrom: null, evolvesTo: ["Wartortle"] })).toEqual(["Wartortle"]);
  });

  it("returns an empty array for a fully-evolved Pokémon with no branches", () => {
    expect(getEvolutionLineNames({ evolvesFrom: "Wartortle", evolvesTo: [] })).toEqual(["Wartortle"]);
  });

  it("handles multiple evolution branches", () => {
    expect(
      getEvolutionLineNames({ evolvesFrom: null, evolvesTo: ["Vaporeon", "Jolteon", "Flareon"] }),
    ).toEqual(["Vaporeon", "Jolteon", "Flareon"]);
  });

  it("de-duplicates names", () => {
    expect(getEvolutionLineNames({ evolvesFrom: "Eevee", evolvesTo: [] })).toEqual(["Eevee"]);
  });
});
