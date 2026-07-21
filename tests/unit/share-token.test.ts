import { describe, expect, it } from "vitest";
import { generateShareToken } from "@/lib/deck/repository";

describe("generateShareToken", () => {
  it("produces a 32-character hex string (128 bits of entropy)", () => {
    const token = generateShareToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("never produces the same token twice across many calls", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateShareToken()));
    expect(tokens.size).toBe(1000);
  });

  it("is not derived from a predictable sequence — consecutive calls share no obvious prefix pattern", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    // A trivial sanity check against an accidental sequential/counter-based
    // implementation: truly random tokens essentially never share a long
    // common prefix.
    let commonPrefixLength = 0;
    while (commonPrefixLength < a.length && a[commonPrefixLength] === b[commonPrefixLength]) {
      commonPrefixLength++;
    }
    expect(commonPrefixLength).toBeLessThan(8);
  });
});
