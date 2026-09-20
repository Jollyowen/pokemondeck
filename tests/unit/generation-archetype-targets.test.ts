import { describe, expect, it } from "vitest";
import { buildPlanDataBlock } from "@/lib/ai/plan-prompt";
import { buildGenerationDataBlock } from "@/lib/ai/generation-prompt";
import { getArchetypeProfile } from "@/lib/ai/archetype-profiles";
import type { CandidatePoolSummary, DeckPlanInput, DeckGenerationInput } from "@/types/deck";

const poolSummary: CandidatePoolSummary = {
  totalCandidates: 10,
  drawSupportCandidates: 2,
  searchSupportCandidates: 2,
  otherTrainerCandidates: 2,
  pokemonCandidatesByType: { Water: 4 },
  energyTypesAvailable: ["Water"],
  evolutionLineNamesAvailable: ["Squirtle"],
};

describe("buildPlanDataBlock — archetypeTargets grounding", () => {
  it("includes the real numeric profile for a named archetype", () => {
    const input: DeckPlanInput = {
      format: "standard",
      strategyArchetype: "mill",
      pokemonName: "Wailord",
      strategyNotes: null,
      poolSummary,
    };
    const data = JSON.parse(buildPlanDataBlock(input));
    const profile = getArchetypeProfile("mill");
    expect(data.archetypeTargets).toEqual({
      pokemonRange: profile.pokemonRange,
      trainerRange: profile.trainerRange,
      energyRange: profile.energyRange,
      drawSupportMin: profile.drawSupportMin,
      searchSupportMin: profile.searchSupportMin,
      basicPokemonMin: profile.basicPokemonMin,
      strategyDescription: profile.strategyDescription,
    });
  });

  it("falls back to the 'other' profile when no archetype was chosen", () => {
    const input: DeckPlanInput = {
      format: "standard",
      strategyArchetype: null,
      pokemonName: "Wailord",
      strategyNotes: null,
      poolSummary,
    };
    const data = JSON.parse(buildPlanDataBlock(input));
    expect(data.archetypeTargets.energyRange).toEqual(getArchetypeProfile("other").energyRange);
    expect(data.archetypeTargets.energyRange).toEqual([8, 12]);
    expect(data.archetypeTargets.strategyDescription).toContain("No specific battle style");
  });

  it("gives each archetype a distinct strategyDescription", () => {
    const descriptions = new Set(
      (["aggro", "control", "mill", "other"] as const).map((a) => getArchetypeProfile(a).strategyDescription),
    );
    expect(descriptions.size).toBe(4);
  });
});

describe("buildGenerationDataBlock — archetypeTargets grounding", () => {
  it("includes the real numeric profile alongside the candidate pool, even when a plan is present", () => {
    const input: DeckGenerationInput = {
      format: "standard",
      strategyArchetype: "aggro",
      pokemonName: "Charizard",
      strategyNotes: null,
      candidateCards: [],
      plan: {
        attackerLine: ["Charmander", "Charmeleon", "Charizard"],
        secondaryLines: [],
        targetPokemon: 16,
        targetTrainer: 24,
        targetEnergy: 20,
        energyTypes: ["Fire"],
        trainerRoleTargets: { draw: 6, search: 8, utility: 4 },
        justification: "Aggro Fire rush.",
      },
    };
    const data = JSON.parse(buildGenerationDataBlock(input));
    const profile = getArchetypeProfile("aggro");
    expect(data.archetypeTargets.pokemonRange).toEqual(profile.pokemonRange);
    expect(data.archetypeTargets.energyRange).toEqual(profile.energyRange);
    expect(data.plan.targetPokemon).toBe(16);
  });
});
