import { describe, expect, it } from "vitest";
import {
  groupPokemonByEvolutionLine,
  groupTrainersByCategory,
  trainerCategory,
} from "@/lib/deck/deck-card-grouping";
import type { Card } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";

function card(overrides: Partial<Card>): Card {
  return {
    id: overrides.id ?? "id-1",
    provider: "pokemon_tcg_api",
    name: "Test Card",
    number: "1",
    setId: "set-1",
    setName: "Test Set",
    imageSmall: "https://example.com/small.png",
    imageLarge: "https://example.com/large.png",
    supertype: "Pokémon",
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

function entry(cardId: string, cardName: string, quantity = 1): DeckCardEntry {
  return { cardId, cardName, quantity };
}

describe("groupPokemonByEvolutionLine", () => {
  it("nests a Stage 1 under its Basic when both are in the deck", () => {
    const cardsById: Record<string, Card> = {
      charmander: card({ id: "charmander", name: "Charmander", evolvesFrom: null, evolvesTo: ["Charmeleon"] }),
      charmeleon: card({ id: "charmeleon", name: "Charmeleon", evolvesFrom: "Charmander", evolvesTo: ["Charizard"] }),
    };
    const entries = [entry("charmeleon", "Charmeleon"), entry("charmander", "Charmander")];

    const tree = groupPokemonByEvolutionLine(entries, cardsById);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("Charmander");
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.name).toBe("Charmeleon");
  });

  it("nests a full three-stage line correctly", () => {
    const cardsById: Record<string, Card> = {
      a: card({ id: "a", name: "Charmander", evolvesFrom: null, evolvesTo: ["Charmeleon"] }),
      b: card({ id: "b", name: "Charmeleon", evolvesFrom: "Charmander", evolvesTo: ["Charizard"] }),
      c: card({ id: "c", name: "Charizard", evolvesFrom: "Charmeleon", evolvesTo: [] }),
    };
    const entries = [entry("c", "Charizard"), entry("a", "Charmander"), entry("b", "Charmeleon")];

    const tree = groupPokemonByEvolutionLine(entries, cardsById);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("Charmander");
    expect(tree[0]?.children[0]?.name).toBe("Charmeleon");
    expect(tree[0]?.children[0]?.children[0]?.name).toBe("Charizard");
  });

  it("treats a Stage 1 with no Basic present in the deck as its own root", () => {
    const cardsById: Record<string, Card> = {
      b: card({ id: "b", name: "Charmeleon", evolvesFrom: "Charmander", evolvesTo: ["Charizard"] }),
    };
    const entries = [entry("b", "Charmeleon")];

    const tree = groupPokemonByEvolutionLine(entries, cardsById);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("Charmeleon");
    expect(tree[0]?.children).toHaveLength(0);
  });

  it("branches multiple evolutions under a single Basic (e.g. Eevee)", () => {
    const cardsById: Record<string, Card> = {
      eevee: card({ id: "eevee", name: "Eevee", evolvesFrom: null, evolvesTo: ["Vaporeon", "Jolteon", "Flareon"] }),
      vap: card({ id: "vap", name: "Vaporeon", evolvesFrom: "Eevee", evolvesTo: [] }),
      jolt: card({ id: "jolt", name: "Jolteon", evolvesFrom: "Eevee", evolvesTo: [] }),
    };
    const entries = [entry("jolt", "Jolteon"), entry("eevee", "Eevee"), entry("vap", "Vaporeon")];

    const tree = groupPokemonByEvolutionLine(entries, cardsById);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.children.map((c) => c.name)).toEqual(["Jolteon", "Vaporeon"]);
  });

  it("collapses multiple printings of the same name into one node", () => {
    const cardsById: Record<string, Card> = {
      p1: card({ id: "p1", name: "Pikachu", evolvesFrom: null, evolvesTo: [] }),
      p2: card({ id: "p2", name: "Pikachu", evolvesFrom: null, evolvesTo: [] }),
    };
    const entries = [entry("p1", "Pikachu"), entry("p2", "Pikachu")];

    const tree = groupPokemonByEvolutionLine(entries, cardsById);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.entries).toHaveLength(2);
  });

  it("ignores non-Pokémon entries entirely", () => {
    const cardsById: Record<string, Card> = {
      trainer: card({ id: "trainer", name: "Ultra Ball", supertype: "Trainer" }),
    };
    const entries = [entry("trainer", "Ultra Ball")];

    expect(groupPokemonByEvolutionLine(entries, cardsById)).toEqual([]);
  });
});

describe("trainerCategory", () => {
  it("classifies a plain Item", () => {
    expect(trainerCategory({ subtypes: ["Item"] })).toBe("Item");
  });

  it("classifies a Supporter", () => {
    expect(trainerCategory({ subtypes: ["Supporter"] })).toBe("Supporter");
  });

  it("classifies a Stadium", () => {
    expect(trainerCategory({ subtypes: ["Stadium"] })).toBe("Stadium");
  });

  it("classifies a Pokémon Tool as Tool", () => {
    expect(trainerCategory({ subtypes: ["Pokémon Tool"] })).toBe("Tool");
  });

  it("classifies ACE SPEC ahead of its other subtype", () => {
    expect(trainerCategory({ subtypes: ["Item", "ACE SPEC"] })).toBe("ACE SPEC");
  });

  it("falls back to Other for an unrecognized subtype", () => {
    expect(trainerCategory({ subtypes: ["Technical Machine"] })).toBe("Other");
  });
});

describe("groupTrainersByCategory", () => {
  it("splits into the five requested buckets in a fixed order, omitting empty ones", () => {
    const cardsById: Record<string, Card> = {
      ball: card({ id: "ball", name: "Ultra Ball", supertype: "Trainer", subtypes: ["Item"] }),
      boss: card({ id: "boss", name: "Boss's Orders", supertype: "Trainer", subtypes: ["Supporter"] }),
      spec: card({ id: "spec", name: "Neo Upper Energy", supertype: "Trainer", subtypes: ["Item", "ACE SPEC"] }),
    };
    const entries = [entry("spec", "Neo Upper Energy"), entry("boss", "Boss's Orders"), entry("ball", "Ultra Ball")];

    const groups = groupTrainersByCategory(entries, cardsById);

    expect(groups.map((g) => g.category)).toEqual(["Item", "Supporter", "ACE SPEC"]);
    expect(groups[0]?.entries[0]?.cardName).toBe("Ultra Ball");
  });

  it("ignores non-Trainer entries entirely", () => {
    const cardsById: Record<string, Card> = {
      mon: card({ id: "mon", name: "Pikachu", supertype: "Pokémon" }),
    };
    expect(groupTrainersByCategory([entry("mon", "Pikachu")], cardsById)).toEqual([]);
  });
});
