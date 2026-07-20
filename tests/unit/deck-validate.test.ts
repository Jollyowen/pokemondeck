import { describe, expect, it } from "vitest";
import { computeDeckValidation, getSpecialSameNameCopyLimit } from "@/lib/deck/validate";
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

function makeSixtyCardValidDeck(): { entries: DeckCardEntry[]; cardsById: Record<string, Card> } {
  const basicPokemon = makeCard({ id: "basic-1", name: "Pikachu", supertype: "Pokémon", subtypes: ["Basic"] });
  const energy = makeCard({
    id: "energy-1",
    name: "Fire Energy",
    supertype: "Energy",
    subtypes: ["Basic"],
  });
  const trainer = makeCard({ id: "trainer-1", name: "Poké Ball", supertype: "Trainer", subtypes: [] });

  const entries: DeckCardEntry[] = [
    { cardId: "basic-1", cardName: "Pikachu", quantity: 4 },
    { cardId: "trainer-1", cardName: "Poké Ball", quantity: 4 },
    { cardId: "energy-1", cardName: "Fire Energy", quantity: 52 },
  ];

  return {
    entries,
    cardsById: { "basic-1": basicPokemon, "trainer-1": trainer, "energy-1": energy },
  };
}

describe("computeDeckValidation — valid fixtures", () => {
  it("marks a 60-card deck with a Basic Pokémon and no rule violations as format_legal", () => {
    const { entries, cardsById } = makeSixtyCardValidDeck();
    const result = computeDeckValidation(entries, cardsById, [], "standard");
    expect(result.status).toBe("format_legal");
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("allows more than 4 copies of Basic Energy", () => {
    const { entries, cardsById } = makeSixtyCardValidDeck();
    const result = computeDeckValidation(entries, cardsById, [], "standard");
    const copyIssues = result.issues.filter((i) => i.code === "COPY_LIMIT_EXCEEDED");
    expect(copyIssues).toHaveLength(0);
  });

  it("marks a deck under 60 cards as draft with a warning, not an error", () => {
    const cardsById = { "basic-1": makeCard({ id: "basic-1", name: "Pikachu" }) };
    const entries: DeckCardEntry[] = [{ cardId: "basic-1", cardName: "Pikachu", quantity: 4 }];
    const result = computeDeckValidation(entries, cardsById, [], "standard");
    expect(result.status).toBe("draft");
    expect(result.issues[0]).toMatchObject({ code: "TOO_FEW_CARDS", severity: "warning" });
  });

  it("groups same-name cards across different printings under one copy limit", () => {
    const printingA = makeCard({ id: "print-a", name: "Charizard", supertype: "Pokémon", subtypes: ["Basic"] });
    const printingB = makeCard({ id: "print-b", name: "Charizard", supertype: "Pokémon", subtypes: ["Basic"] });
    const entries: DeckCardEntry[] = [
      { cardId: "print-a", cardName: "Charizard", quantity: 2 },
      { cardId: "print-b", cardName: "Charizard", quantity: 3 },
    ];
    const result = computeDeckValidation(entries, { "print-a": printingA, "print-b": printingB }, [], "all");
    const issue = result.issues.find((i) => i.code === "COPY_LIMIT_EXCEEDED");
    expect(issue).toBeDefined();
    expect(issue?.cardIds).toEqual(expect.arrayContaining(["print-a", "print-b"]));
  });

  it("does not combine different names just because they represent the same character", () => {
    const base = makeCard({ id: "base", name: "Pikachu" });
    const vForm = makeCard({ id: "v-form", name: "Pikachu V" });
    const entries: DeckCardEntry[] = [
      { cardId: "base", cardName: "Pikachu", quantity: 4 },
      { cardId: "v-form", cardName: "Pikachu V", quantity: 4 },
    ];
    const result = computeDeckValidation(entries, { base, "v-form": vForm }, [], "all");
    expect(result.issues.filter((i) => i.code === "COPY_LIMIT_EXCEEDED")).toHaveLength(0);
  });

  it("never removes cards when the format changes, only flags legality", () => {
    const illegalCard = makeCard({
      id: "illegal-1",
      name: "Old Card",
      legalities: { standard: "not_legal", expanded: "legal", unlimited: "legal" },
    });
    const entries: DeckCardEntry[] = [{ cardId: "illegal-1", cardName: "Old Card", quantity: 1 }];
    const result = computeDeckValidation(entries, { "illegal-1": illegalCard }, [], "standard");
    // The card is still counted, not silently dropped.
    expect(result.issues.some((i) => i.code === "FORMAT_ILLEGAL")).toBe(true);
  });
});

describe("computeDeckValidation — invalid fixtures", () => {
  it("flags more than 4 copies of a non-energy card", () => {
    const card = makeCard({ id: "c1", name: "Professor's Research", supertype: "Trainer", subtypes: [] });
    const entries: DeckCardEntry[] = [{ cardId: "c1", cardName: "Professor's Research", quantity: 5 }];
    const result = computeDeckValidation(entries, { c1: card }, [], "all");
    expect(result.issues.some((i) => i.code === "COPY_LIMIT_EXCEEDED")).toBe(true);
  });

  it("flags more than 60 cards as an error", () => {
    const card = makeCard({ id: "c1", name: "Energy", supertype: "Energy", subtypes: ["Basic"] });
    const entries: DeckCardEntry[] = [{ cardId: "c1", cardName: "Energy", quantity: 61 }];
    const result = computeDeckValidation(entries, { c1: card }, [], "all");
    expect(result.issues.some((i) => i.code === "TOO_MANY_CARDS")).toBe(true);
    expect(result.status).toBe("draft");
  });

  it("requires at least one Basic Pokémon in a complete deck", () => {
    const trainer = makeCard({ id: "t1", name: "Trainer Card", supertype: "Trainer", subtypes: [] });
    const energy = makeCard({ id: "e1", name: "Fire Energy", supertype: "Energy", subtypes: ["Basic"] });
    const entries: DeckCardEntry[] = [
      { cardId: "t1", cardName: "Trainer Card", quantity: 4 },
      { cardId: "e1", cardName: "Fire Energy", quantity: 56 },
    ];
    const result = computeDeckValidation(entries, { t1: trainer, e1: energy }, [], "all");
    expect(result.issues.some((i) => i.code === "NO_BASIC_POKEMON")).toBe(true);
    expect(result.status).toBe("draft");
  });

  it("flags a card that could not be resolved as CARD_NOT_FOUND", () => {
    const entries: DeckCardEntry[] = [{ cardId: "missing-1", cardName: "Ghost Card", quantity: 1 }];
    const result = computeDeckValidation(entries, {}, ["missing-1"], "all");
    expect(result.issues.some((i) => i.code === "CARD_NOT_FOUND")).toBe(true);
    expect(result.status).toBe("draft");
  });

  it("enforces a special same-name copy limit below 4 when stated in rules text", () => {
    const card = makeCard({
      id: "ace-1",
      name: "Computer Search",
      supertype: "Trainer",
      subtypes: ["ACE SPEC"],
      rules: ["You may only have 1 of this card in your deck."],
    });
    const entries: DeckCardEntry[] = [{ cardId: "ace-1", cardName: "Computer Search", quantity: 2 }];
    const result = computeDeckValidation(entries, { "ace-1": card }, [], "all");
    const issue = result.issues.find((i) => i.code === "SPECIAL_COPY_LIMIT_EXCEEDED");
    expect(issue).toBeDefined();
  });

  it("keeps status as complete (not format_legal) when only format legality fails", () => {
    const { entries, cardsById } = makeSixtyCardValidDeck();
    cardsById["basic-1"] = {
      ...cardsById["basic-1"]!,
      legalities: { standard: "not_legal", expanded: "legal", unlimited: "legal" },
    };
    const result = computeDeckValidation(entries, cardsById, [], "standard");
    expect(result.status).toBe("complete");
  });
});

describe("getSpecialSameNameCopyLimit", () => {
  it("returns null when rules text has no explicit limit", () => {
    expect(getSpecialSameNameCopyLimit({ rules: [] })).toBeNull();
    expect(getSpecialSameNameCopyLimit({ rules: ["This Pokémon has no Retreat Cost."] })).toBeNull();
  });

  it("detects an explicit single-copy restriction", () => {
    expect(
      getSpecialSameNameCopyLimit({ rules: ["You can't have more than 1 copy of this card in your deck."] }),
    ).toBe(1);
  });
});
