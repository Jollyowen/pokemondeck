import { describe, expect, it } from "vitest";
import { isSafeEnergyTypeWord } from "@/lib/cards/local-card-repository";

describe("isSafeEnergyTypeWord", () => {
  // Regression coverage for a filter-injection gap: `pokemonType` is
  // free-form user input at the API boundary (only length-capped by the
  // schema — the dropdown that normally constrains it in the UI doesn't
  // bind a direct API caller), and searchLocalCards used to interpolate
  // it straight into a raw PostgREST `.or()` filter-syntax string for
  // Energy-supertype searches. This predicate is what now gates that
  // interpolation.

  it("accepts real elemental type names", () => {
    for (const type of ["Fire", "Water", "Grass", "Lightning", "Colorless", "Darkness"]) {
      expect(isSafeEnergyTypeWord(type)).toBe(true);
    }
  });

  it("rejects values containing PostgREST filter-syntax characters", () => {
    // Each of these could otherwise break out of the intended
    // `types.cs.{...},name.ilike.%...%` filter expression.
    for (const malicious of [
      "Fire,status.eq.legal",
      "Fire)",
      "Fire}",
      'Fire"',
      "Fire.and(",
      "Fire Water",
      "",
    ]) {
      expect(isSafeEnergyTypeWord(malicious)).toBe(false);
    }
  });

  it("rejects non-letter characters generally, not just a denylist", () => {
    // Deliberately a positive allowlist (letters only), not a denylist of
    // known-bad characters — anything outside a-z/A-Z falls back to the
    // safe, parameterized .contains() filter instead of being rejected
    // outright.
    expect(isSafeEnergyTypeWord("Fire1")).toBe(false);
    expect(isSafeEnergyTypeWord("水")).toBe(false);
  });
});
