import { describe, expect, it } from "vitest";
import { extractPrice, normalizeCard } from "@/lib/providers/tcgdex-api-core";
import type { Card } from "@/types/card";

describe("tcgdex normalizeCard", () => {
  it("maps category to the app's Pokémon/Trainer/Energy supertype", () => {
    const card = normalizeCard({
      id: "swsh3-136",
      name: "Furret",
      category: "Pokemon",
      set: { id: "swsh3", name: "Darkness Ablaze" },
    });
    expect(card.supertype).toBe("Pokémon");
  });

  it("reconstructs subtypes from stage/suffix/trainerType/energyType", () => {
    const pokemon = normalizeCard({
      id: "a-1",
      name: "Charizard ex",
      category: "Pokemon",
      stage: "Stage2",
      suffix: "ex",
    });
    expect(pokemon.subtypes).toEqual(["Stage2", "ex"]);

    const trainer = normalizeCard({
      id: "a-2",
      name: "Ultra Ball",
      category: "Trainer",
      trainerType: "Item",
    });
    expect(trainer.subtypes).toEqual(["Item"]);
  });

  it("maps abilities and resistances through with the same shape as weaknesses", () => {
    const card = normalizeCard({
      id: "base1-2",
      name: "Blastoise",
      category: "Pokemon",
      abilities: [{ type: "Poke-POWER", name: "Rain Dance", effect: "Attach a Water Energy." }],
      weaknesses: [{ type: "Grass", value: "×2" }],
      resistances: [{ type: "Fire", value: "-30" }],
    });
    expect(card.abilities).toEqual([
      { name: "Rain Dance", text: "Attach a Water Energy.", type: "Poke-POWER" },
    ]);
    expect(card.resistances).toEqual([{ type: "Fire", value: "-30" }]);
  });

  it("derives convertedEnergyCost from attack cost length (no precomputed field from TCGdex)", () => {
    const card = normalizeCard({
      id: "a-3",
      name: "Test",
      category: "Pokemon",
      attacks: [{ name: "Tackle", cost: ["Colorless", "Colorless"], damage: 20 }],
    });
    expect(card.attacks[0]?.convertedEnergyCost).toBe(2);
  });

  it("reconstructs a retreatCost array of the right length from the single retreat count", () => {
    const card = normalizeCard({ id: "a-4", name: "Test", category: "Pokemon", retreat: 3 });
    expect(card.retreatCost).toEqual(["Colorless", "Colorless", "Colorless"]);
    expect(card.convertedRetreatCost).toBe(3);
  });

  it("leaves evolvesTo empty — derived separately by the sync script's reverse-index pass", () => {
    const card = normalizeCard({ id: "a-5", name: "Charmander", category: "Pokemon" });
    expect(card.evolvesTo).toEqual([]);
  });

  it("defaults unlimited legality to unknown, since TCGdex doesn't expose it", () => {
    const card = normalizeCard({
      id: "a-6",
      name: "Test",
      category: "Pokemon",
      legal: { standard: true, expanded: false },
    });
    expect(card.legalities).toEqual({ standard: "legal", expanded: "not_legal", unlimited: "unknown" });
  });
});

describe("tcgdex extractPrice", () => {
  it("prefers normal pricing over other variants when both are present", () => {
    const price = extractPrice({
      tcgplayer: {
        normal: { marketPrice: 0.09, lowPrice: 0.02, highPrice: 25.09 },
        reverse: { marketPrice: 0.23 },
      } as never,
    });
    expect(price?.variant).toBe("normal");
    expect(price?.market).toBe(0.09);
  });

  it("returns null when there's no tcgplayer pricing block at all", () => {
    expect(extractPrice(undefined)).toBeNull();
    expect(extractPrice({})).toBeNull();
  });
});

// Mirrors the reverse-index logic in scripts/sync-cards.ts's
// buildEvolvesToIndex — that function isn't exported (script, not a
// module other code imports), so this test re-implements the same
// minimal algorithm here to guard the logic in isolation.
function buildEvolvesToIndex(cards: Card[]): Map<string, string[]> {
  const byEvolveFromName = new Map<string, string[]>();
  for (const card of cards) {
    if (!card.evolvesFrom) continue;
    const key = card.evolvesFrom.toLowerCase();
    const existing = byEvolveFromName.get(key) ?? [];
    existing.push(card.id);
    byEvolveFromName.set(key, existing);
  }
  const evolvesToById = new Map<string, string[]>();
  for (const card of cards) {
    const evolvesTo = byEvolveFromName.get(card.name.toLowerCase());
    if (evolvesTo && evolvesTo.length > 0) evolvesToById.set(card.id, evolvesTo);
  }
  return evolvesToById;
}

function stubCard(id: string, name: string, evolvesFrom: string | null): Card {
  return {
    ...normalizeCard({ id, name, category: "Pokemon" }),
    evolvesFrom,
  };
}

describe("evolvesTo reverse-index derivation", () => {
  it("builds a forward evolvesTo pointer from cards' evolveFrom", () => {
    const cards = [
      stubCard("a-charmander", "Charmander", null),
      stubCard("a-charmeleon", "Charmeleon", "Charmander"),
      stubCard("a-charizard", "Charizard", "Charmeleon"),
    ];
    const index = buildEvolvesToIndex(cards);
    expect(index.get("a-charmander")).toEqual(["a-charmeleon"]);
    expect(index.get("a-charmeleon")).toEqual(["a-charizard"]);
    expect(index.has("a-charizard")).toBe(false); // nothing evolves from it
  });

  it("aggregates multiple printings that all evolve from the same name", () => {
    const cards = [
      stubCard("a-eevee", "Eevee", null),
      stubCard("a-vaporeon", "Vaporeon", "Eevee"),
      stubCard("a-jolteon", "Jolteon", "Eevee"),
    ];
    const index = buildEvolvesToIndex(cards);
    expect(index.get("a-eevee")?.sort()).toEqual(["a-jolteon", "a-vaporeon"]);
  });

  it("is order-independent — works even if evolutions are seen before their base", () => {
    const cards = [
      stubCard("a-charizard", "Charizard", "Charmeleon"),
      stubCard("a-charmeleon", "Charmeleon", "Charmander"),
      stubCard("a-charmander", "Charmander", null),
    ];
    const index = buildEvolvesToIndex(cards);
    expect(index.get("a-charmander")).toEqual(["a-charmeleon"]);
    expect(index.get("a-charmeleon")).toEqual(["a-charizard"]);
  });
});
