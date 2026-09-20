import { describe, expect, it } from "vitest";
import { isDrawSupportCard, isSearchSupportCard } from "@/lib/deck/text-heuristics";

function card(text: string, kind: "rules" | "ability" | "attack" = "rules") {
  if (kind === "rules") return { rules: [text], abilities: [], attacks: [] };
  if (kind === "ability") return { rules: [], abilities: [{ name: "X", text, type: "Ability" }], attacks: [] };
  return {
    rules: [],
    abilities: [],
    attacks: [{ name: "X", cost: [], convertedEnergyCost: 0, damage: "", text }],
  };
}

describe("isDrawSupportCard", () => {
  it("matches imperative Trainer-style phrasing", () => {
    expect(isDrawSupportCard(card("Draw 3 cards."))).toBe(true);
  });

  it("matches third-person phrasing on a Pokémon ability — real bug: this used to be silently missed", () => {
    // Real reported bug: a generated deck was stuck at exactly 4
    // draw-support cards no matter what the AI refinement pass tried.
    // Root cause was this exact gap — Trainer text is usually imperative
    // ("Draw 2 cards"), but Pokémon abilities/attacks are very often
    // third-person ("This Pokémon draws 2 cards"), which the original
    // \bdraw\b (no "s") pattern never matched at all.
    expect(isDrawSupportCard(card("Once during your turn, this Pokémon draws 2 cards.", "ability"))).toBe(true);
  });

  it("matches gerund phrasing", () => {
    expect(isDrawSupportCard(card("Heal 30 damage by drawing 2 cards.", "attack"))).toBe(true);
  });

  it("matches 'draw a card' singular", () => {
    expect(isDrawSupportCard(card("Draw a card."))).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(isDrawSupportCard(card("Flip a coin. If heads, this attack does 30 more damage."))).toBe(false);
  });
});

describe("isSearchSupportCard", () => {
  it("matches imperative Trainer-style phrasing", () => {
    expect(isSearchSupportCard(card("Search your deck for a Pokémon."))).toBe(true);
  });

  it("matches third-person phrasing on a Pokémon ability", () => {
    expect(isSearchSupportCard(card("This Pokémon searches your deck for a Basic Energy.", "ability"))).toBe(true);
  });

  it("matches 'look(s)/looking at the top' phrasing", () => {
    expect(isSearchSupportCard(card("Your opponent looks at the top card of their deck."))).toBe(true);
  });

  it("matches 'reveal(s)/revealing ... from your deck' phrasing", () => {
    expect(isSearchSupportCard(card("Reveal a Supporter card from your deck and put it into your hand."))).toBe(
      true,
    );
  });

  it("does not match unrelated text", () => {
    expect(isSearchSupportCard(card("Discard an Energy from 1 of your opponent's Pokémon."))).toBe(false);
  });
});
