import { describe, expect, it } from "vitest";
import { parseAndValidateGenerationOutput } from "@/lib/ai/generation-schema";

const VALID = JSON.stringify({
  deckName: "Charizard Rush",
  explanation: "A fast Fire deck built around Charizard.",
  cards: [{ cardId: "swsh1-1", count: 4 }],
});

describe("parseAndValidateGenerationOutput", () => {
  it("accepts well-formed, schema-matching JSON", () => {
    expect(parseAndValidateGenerationOutput(VALID)).not.toBeNull();
  });

  it("returns null for text that isn't JSON at all", () => {
    expect(parseAndValidateGenerationOutput("not json")).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    const missingDeckName = JSON.stringify({
      explanation: "x",
      cards: [{ cardId: "a", count: 1 }],
    });
    expect(parseAndValidateGenerationOutput(missingDeckName)).toBeNull();
  });

  it("returns null when cards is a string instead of an array", () => {
    const stringifiedCards = JSON.stringify({
      deckName: "x",
      explanation: "x",
      cards: "not-an-array",
    });
    expect(parseAndValidateGenerationOutput(stringifiedCards)).toBeNull();
  });

  it("returns null when a card count is not a positive integer", () => {
    const badCount = JSON.stringify({
      deckName: "x",
      explanation: "x",
      cards: [{ cardId: "a", count: -1 }],
    });
    expect(parseAndValidateGenerationOutput(badCount)).toBeNull();
  });
});
