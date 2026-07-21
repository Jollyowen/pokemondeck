import { describe, expect, it } from "vitest";
import { parseAndValidateReviewOutput } from "@/lib/ai/review-schema";

const VALID = JSON.stringify({
  summary: "A summary",
  strengths: [],
  issues: [],
  suggestedSwaps: [],
  confidence: "medium",
  limitations: [],
});

describe("parseAndValidateReviewOutput", () => {
  it("accepts well-formed, schema-matching JSON", () => {
    expect(parseAndValidateReviewOutput(VALID)).not.toBeNull();
  });

  it("returns null for text that isn't JSON at all", () => {
    expect(parseAndValidateReviewOutput("not json")).toBeNull();
  });

  it("returns null for valid JSON that isn't an object", () => {
    expect(parseAndValidateReviewOutput('"just a string"')).toBeNull();
    expect(parseAndValidateReviewOutput("42")).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    const missingSummary = JSON.stringify({
      strengths: [],
      issues: [],
      suggestedSwaps: [],
      confidence: "medium",
      limitations: [],
    });
    expect(parseAndValidateReviewOutput(missingSummary)).toBeNull();
  });

  it("returns null when an array field is a string instead of an array (the real bug hit in production)", () => {
    const stringifiedStrengths = JSON.stringify({
      summary: "x",
      strengths: "<strengths><item>...</item></strengths>",
      issues: [],
      suggestedSwaps: [],
      confidence: "medium",
      limitations: [],
    });
    expect(parseAndValidateReviewOutput(stringifiedStrengths)).toBeNull();
  });

  it("returns null when confidence is outside the allowed enum", () => {
    const badConfidence = JSON.stringify({
      summary: "x",
      strengths: [],
      issues: [],
      suggestedSwaps: [],
      confidence: "extremely high",
      limitations: [],
    });
    expect(parseAndValidateReviewOutput(badConfidence)).toBeNull();
  });

  it("returns null when a swap count is not a positive integer", () => {
    const badSwap = JSON.stringify({
      summary: "x",
      strengths: [],
      issues: [],
      suggestedSwaps: [{ remove: [{ cardId: "a", count: -1 }], add: [], reason: "x" }],
      confidence: "medium",
      limitations: [],
    });
    expect(parseAndValidateReviewOutput(badSwap)).toBeNull();
  });
});
