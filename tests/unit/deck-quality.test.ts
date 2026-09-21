import { describe, expect, it } from "vitest";
import { computeDeckQuality } from "@/lib/ai/deck-quality";
import { computeDeckStatistics } from "@/lib/deck/statistics";
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

function makeGoodDeck() {
  const attacker = makeCard({
    id: "attacker",
    name: "Blastoise",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    types: ["Water"],
    attacks: [{ name: "Hydro Pump", cost: ["Water", "Water", "Colorless"], convertedEnergyCost: 3, damage: "90", text: "" }],
  });
  const draw = makeCard({
    id: "draw",
    name: "Professor's Research",
    supertype: "Trainer",
    rules: ["Discard your hand and draw 7 cards."],
  });
  const search = makeCard({
    id: "search",
    name: "Ultra Ball",
    supertype: "Trainer",
    rules: ["Search your deck for a Pokémon."],
  });
  const filler = makeCard({ id: "filler", name: "Filler Item", supertype: "Trainer" });
  const energy = makeCard({ id: "energy", name: "Water Energy", supertype: "Energy", subtypes: ["Basic"], types: ["Water"] });

  const cardsById = { attacker, draw, search, filler, energy };
  // Totals exactly 60 (18 Pokémon + 30 Trainer + 12 Energy) and sits
  // within every "other"-profile range with room to spare, now that
  // TOTAL_CARD_COUNT_LOW is itself a hard check a "good" deck must pass.
  const entries: DeckCardEntry[] = [
    { cardId: "attacker", cardName: "Blastoise", quantity: 18 },
    { cardId: "draw", cardName: "Professor's Research", quantity: 8 },
    { cardId: "search", cardName: "Ultra Ball", quantity: 8 },
    { cardId: "filler", cardName: "Filler Item", quantity: 14 },
    { cardId: "energy", cardName: "Water Energy", quantity: 12 },
  ];
  return { entries, cardsById };
}

describe("computeDeckQuality — good deck passes", () => {
  it("passes all hard checks for a well-formed deck", () => {
    const { entries, cardsById } = makeGoodDeck();
    const statistics = computeDeckStatistics(entries, cardsById, "all");
    const result = computeDeckQuality(entries, cardsById, statistics, "other", "all");
    expect(result.passesHardChecks).toBe(true);
    expect(result.issues.filter((i) => i.severity === "hard")).toHaveLength(0);
  });
});

describe("computeDeckQuality — hard checks", () => {
  it("flags Pokémon count outside the archetype range", () => {
    const { entries, cardsById } = makeGoodDeck();
    const tooFewPokemon = entries.map((e) => (e.cardId === "attacker" ? { ...e, quantity: 2 } : e));
    tooFewPokemon.push({ cardId: "filler", cardName: "Filler Item", quantity: 15 });
    const statistics = computeDeckStatistics(tooFewPokemon, cardsById, "all");
    const result = computeDeckQuality(tooFewPokemon, cardsById, statistics, "other", "all");
    expect(result.issues.some((i) => i.code === "POKEMON_COUNT_OUT_OF_RANGE")).toBe(true);
    expect(result.passesHardChecks).toBe(false);
  });

  it("flags Energy count outside the archetype range", () => {
    const { entries, cardsById } = makeGoodDeck();
    const noEnergy = entries.filter((e) => e.cardId !== "energy");
    noEnergy.push({ cardId: "filler", cardName: "Filler Item", quantity: 10 });
    const statistics = computeDeckStatistics(noEnergy, cardsById, "all");
    const result = computeDeckQuality(noEnergy, cardsById, statistics, "other", "all");
    expect(result.issues.some((i) => i.code === "ENERGY_COUNT_OUT_OF_RANGE")).toBe(true);
  });

  it("flags low draw support", () => {
    const { entries, cardsById } = makeGoodDeck();
    const noDraw = entries.filter((e) => e.cardId !== "draw");
    noDraw.push({ cardId: "filler", cardName: "Filler Item", quantity: 4 });
    const statistics = computeDeckStatistics(noDraw, cardsById, "all");
    const result = computeDeckQuality(noDraw, cardsById, statistics, "other", "all");
    expect(result.issues.some((i) => i.code === "LOW_DRAW_SUPPORT")).toBe(true);
  });

  it("flags low search support", () => {
    const { entries, cardsById } = makeGoodDeck();
    const noSearch = entries.filter((e) => e.cardId !== "search");
    noSearch.push({ cardId: "filler", cardName: "Filler Item", quantity: 4 });
    const statistics = computeDeckStatistics(noSearch, cardsById, "all");
    const result = computeDeckQuality(noSearch, cardsById, statistics, "other", "all");
    expect(result.issues.some((i) => i.code === "LOW_SEARCH_SUPPORT")).toBe(true);
  });

  it("flags too few Basic Pokémon", () => {
    const stage1 = makeCard({
      id: "stage1",
      name: "Wartortle",
      supertype: "Pokémon",
      subtypes: ["Stage 1"],
      evolvesFrom: "Squirtle",
      types: ["Water"],
    });
    const { entries, cardsById } = makeGoodDeck();
    const withStage1Instead = entries.map((e) =>
      e.cardId === "attacker" ? { cardId: "stage1", cardName: "Wartortle", quantity: 17 } : e,
    );
    const allCards = { ...cardsById, stage1 };
    const statistics = computeDeckStatistics(withStage1Instead, allCards, "all");
    const result = computeDeckQuality(withStage1Instead, allCards, statistics, "other", "all");
    expect(result.issues.some((i) => i.code === "LOW_BASIC_POKEMON")).toBe(true);
  });

  it("flags a mismatch between attack energy costs and the energy actually in the deck", () => {
    const fireAttacker = makeCard({
      id: "fireAttacker",
      name: "Charizard",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      types: ["Fire"],
      attacks: [{ name: "Flame Burst", cost: ["Fire", "Fire"], convertedEnergyCost: 2, damage: "90", text: "" }],
    });
    const waterEnergy = makeCard({ id: "waterEnergy", name: "Water Energy", supertype: "Energy", subtypes: ["Basic"], types: ["Water"] });
    const entries: DeckCardEntry[] = [
      { cardId: "fireAttacker", cardName: "Charizard", quantity: 17 },
      { cardId: "waterEnergy", cardName: "Water Energy", quantity: 10 },
    ];
    const cardsById = { fireAttacker, waterEnergy };
    const statistics = computeDeckStatistics(entries, cardsById, "all");
    const result = computeDeckQuality(entries, cardsById, statistics, "other", "all");
    expect(result.issues.some((i) => i.code === "ENERGY_TYPE_MISMATCH")).toBe(true);
  });

  it("does not flag energy type mismatch when types is empty and subtypes says \"Normal\" (real TCGdex shape)", () => {
    // Regression test: this is the actual shape TCGdex returns for most
    // Basic Energy cards — subtypes: ["Normal"] (not "Basic"), types: []
    // (not populated). Before this fix, this scenario ALWAYS false-
    // flagged ENERGY_TYPE_MISMATCH regardless of what energy was
    // actually in the deck, since presentEnergyTypes never had anything
    // added to it.
    const fireAttacker = makeCard({
      id: "fireAttacker",
      name: "Charizard",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      types: ["Fire"],
      attacks: [{ name: "Flame Burst", cost: ["Fire", "Fire"], convertedEnergyCost: 2, damage: "90", text: "" }],
    });
    const fireEnergy = makeCard({
      id: "fireEnergy",
      name: "Fire Energy",
      supertype: "Energy",
      subtypes: ["Normal"],
      types: [],
    });
    const entries: DeckCardEntry[] = [
      { cardId: "fireAttacker", cardName: "Charizard", quantity: 17 },
      { cardId: "fireEnergy", cardName: "Fire Energy", quantity: 10 },
    ];
    const cardsById = { fireAttacker, fireEnergy };
    const statistics = computeDeckStatistics(entries, cardsById, "all");
    const result = computeDeckQuality(entries, cardsById, statistics, "other", "all");
    expect(result.issues.some((i) => i.code === "ENERGY_TYPE_MISMATCH")).toBe(false);
  });

  it("does not flag energy type mismatch when only Colorless cost is required", () => {
    const colorlessAttacker = makeCard({
      id: "colorlessAttacker",
      name: "Eevee",
      supertype: "Pokémon",
      subtypes: ["Basic"],
      types: ["Colorless"],
      attacks: [{ name: "Tackle", cost: ["Colorless"], convertedEnergyCost: 1, damage: "10", text: "" }],
    });
    const anyEnergy = makeCard({ id: "anyEnergy", name: "Water Energy", supertype: "Energy", subtypes: ["Basic"], types: ["Water"] });
    const entries: DeckCardEntry[] = [
      { cardId: "colorlessAttacker", cardName: "Eevee", quantity: 17 },
      { cardId: "anyEnergy", cardName: "Water Energy", quantity: 10 },
    ];
    const cardsById = { colorlessAttacker, anyEnergy };
    const statistics = computeDeckStatistics(entries, cardsById, "all");
    const result = computeDeckQuality(entries, cardsById, statistics, "other", "all");
    expect(result.issues.some((i) => i.code === "ENERGY_TYPE_MISMATCH")).toBe(false);
  });

  it("flags a deck that comes up short of 60 total cards, even if every other check passes", () => {
    const { entries, cardsById } = makeGoodDeck();
    // Trim each category down to the bottom edge of its own "other"-
    // profile range (still individually passing) — this is exactly the
    // shape a truncated refinement-pass response could produce (e.g.
    // only the changed cards echoed back), where every category still
    // looks individually fine but the deck as a whole is incomplete.
    const shortDeck = entries.map((e) => {
      if (e.cardId === "attacker") return { ...e, quantity: 15 }; // bottom of pokemonRange [15,20]
      if (e.cardId === "filler") return { ...e, quantity: 4 }; // brings trainerRange to its floor of 20
      if (e.cardId === "energy") return { ...e, quantity: 8 }; // bottom of energyRange [8,12]
      return e;
    });
    const statistics = computeDeckStatistics(shortDeck, cardsById, "all");
    const result = computeDeckQuality(shortDeck, cardsById, statistics, "other", "all");
    const total = statistics.totalPokemon + statistics.totalTrainer + statistics.totalEnergy;
    expect(total).toBe(43); // well short of 60
    expect(result.issues.filter((i) => i.severity === "hard" && i.code !== "TOTAL_CARD_COUNT_LOW")).toHaveLength(0);
    const issue = result.issues.find((i) => i.code === "TOTAL_CARD_COUNT_LOW");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("hard");
    expect(result.passesHardChecks).toBe(false);
  });

  it("uses the mill profile's much lower energy/higher trainer thresholds instead of the default profile", () => {
    const { cardsById } = makeGoodDeck();
    const millDeck: DeckCardEntry[] = [
      { cardId: "attacker", cardName: "Blastoise", quantity: 10 },
      { cardId: "draw", cardName: "Professor's Research", quantity: 4 },
      { cardId: "search", cardName: "Ultra Ball", quantity: 4 },
      { cardId: "filler", cardName: "Filler Item", quantity: 34 },
      { cardId: "energy", cardName: "Water Energy", quantity: 8 },
    ];
    const statistics = computeDeckStatistics(millDeck, cardsById, "all");
    const millResult = computeDeckQuality(millDeck, cardsById, statistics, "mill", "all");
    const otherResult = computeDeckQuality(millDeck, cardsById, statistics, "other", "all");
    expect(millResult.issues.some((i) => i.code === "TRAINER_COUNT_OUT_OF_RANGE")).toBe(false);
    expect(otherResult.issues.some((i) => i.code === "TRAINER_COUNT_OUT_OF_RANGE")).toBe(true);
  });

  it("uses the toolbox profile's much higher search-support minimum instead of the default profile", () => {
    const { cardsById } = makeGoodDeck();
    // 8 search-support copies: above "other"'s min of 6, but below
    // toolbox's min of 10 — the whole point of toolbox is that search is
    // the backbone of the strategy, not just an ordinary consistency card.
    const toolboxDeck: DeckCardEntry[] = [
      { cardId: "attacker", cardName: "Blastoise", quantity: 12 },
      { cardId: "draw", cardName: "Professor's Research", quantity: 6 },
      { cardId: "search", cardName: "Ultra Ball", quantity: 8 },
      { cardId: "filler", cardName: "Filler Item", quantity: 24 },
      { cardId: "energy", cardName: "Water Energy", quantity: 10 },
    ];
    const statistics = computeDeckStatistics(toolboxDeck, cardsById, "all");
    const toolboxResult = computeDeckQuality(toolboxDeck, cardsById, statistics, "toolbox", "all");
    const otherResult = computeDeckQuality(toolboxDeck, cardsById, statistics, "other", "all");
    expect(toolboxResult.issues.some((i) => i.code === "LOW_SEARCH_SUPPORT")).toBe(true);
    expect(otherResult.issues.some((i) => i.code === "LOW_SEARCH_SUPPORT")).toBe(false);
  });

  it("uses the midrange profile's tighter Trainer range instead of the default profile", () => {
    const { cardsById } = makeGoodDeck();
    // 22 Trainer total: within "other"'s wide 20-30 range, but outside
    // midrange's tighter 23-28 range.
    const midrangeDeck: DeckCardEntry[] = [
      { cardId: "attacker", cardName: "Blastoise", quantity: 16 },
      { cardId: "draw", cardName: "Professor's Research", quantity: 8 },
      { cardId: "search", cardName: "Ultra Ball", quantity: 8 },
      { cardId: "filler", cardName: "Filler Item", quantity: 6 },
      { cardId: "energy", cardName: "Water Energy", quantity: 22 },
    ];
    const statistics = computeDeckStatistics(midrangeDeck, cardsById, "all");
    const midrangeResult = computeDeckQuality(midrangeDeck, cardsById, statistics, "midrange", "all");
    const otherResult = computeDeckQuality(midrangeDeck, cardsById, statistics, "other", "all");
    expect(midrangeResult.issues.some((i) => i.code === "TRAINER_COUNT_OUT_OF_RANGE")).toBe(true);
    expect(otherResult.issues.some((i) => i.code === "TRAINER_COUNT_OUT_OF_RANGE")).toBe(false);
  });
});

describe("computeDeckQuality — soft checks never affect passesHardChecks", () => {
  it("flags a shallow evolution line as soft, not hard", () => {
    const stage1 = makeCard({
      id: "stage1",
      name: "Wartortle",
      supertype: "Pokémon",
      subtypes: ["Stage 1"],
      evolvesFrom: "Squirtle",
      types: ["Water"],
      attacks: [{ name: "Bite", cost: ["Water"], convertedEnergyCost: 1, damage: "30", text: "" }],
    });
    const basic = makeCard({ id: "basic", name: "Squirtle", supertype: "Pokémon", subtypes: ["Basic"], types: ["Water"] });
    const { entries, cardsById } = makeGoodDeck();
    const withShallowLine = entries
      .filter((e) => e.cardId !== "attacker")
      .concat([
        { cardId: "stage1", cardName: "Wartortle", quantity: 16 },
        { cardId: "basic", cardName: "Squirtle", quantity: 1 },
      ]);
    const allCards = { ...cardsById, stage1, basic };
    const statistics = computeDeckStatistics(withShallowLine, allCards, "all");
    const result = computeDeckQuality(withShallowLine, allCards, statistics, "other", "all");
    const issue = result.issues.find((i) => i.code === "SHALLOW_EVOLUTION_LINE");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("soft");
  });

  it("flags heavy multi-prize composition as soft and informational", () => {
    const exAttacker = makeCard({
      id: "exAttacker",
      name: "Blastoise ex",
      supertype: "Pokémon",
      subtypes: ["Basic", "ex"],
      types: ["Water"],
      attacks: [{ name: "Hydro Pump", cost: ["Water"], convertedEnergyCost: 1, damage: "90", text: "" }],
    });
    const { entries, cardsById } = makeGoodDeck();
    const heavyExDeck = entries.map((e) =>
      e.cardId === "attacker" ? { ...e, cardId: "exAttacker", cardName: "Blastoise ex" } : e,
    );
    const allCards = { ...cardsById, exAttacker };
    const statistics = computeDeckStatistics(heavyExDeck, allCards, "all");
    const result = computeDeckQuality(heavyExDeck, allCards, statistics, "other", "all");
    const issue = result.issues.find((i) => i.code === "HEAVY_MULTI_PRIZE");
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("soft");
    expect(result.passesHardChecks).toBe(true);
  });
});
