import type { StrategyArchetype } from "@/types/deck";

export type ArchetypeProfile = {
  pokemonRange: [number, number];
  trainerRange: [number, number];
  energyRange: [number, number];
  drawSupportMin: number;
  searchSupportMin: number;
  basicPokemonMin: number;
  retreatCostCeiling: number;
};

const PROFILES: Record<StrategyArchetype, ArchetypeProfile> = {
  aggro: {
    pokemonRange: [14, 18],
    trainerRange: [20, 26],
    energyRange: [14, 18],
    drawSupportMin: 6,
    searchSupportMin: 8,
    basicPokemonMin: 10,
    retreatCostCeiling: 1.5,
  },
  control: {
    pokemonRange: [10, 15],
    trainerRange: [25, 32],
    energyRange: [10, 14],
    drawSupportMin: 8,
    searchSupportMin: 6,
    basicPokemonMin: 8,
    retreatCostCeiling: 2.5,
  },
  mill: {
    pokemonRange: [8, 12],
    trainerRange: [34, 42],
    energyRange: [7, 11],
    drawSupportMin: 4,
    searchSupportMin: 4,
    basicPokemonMin: 6,
    retreatCostCeiling: 2.5,
  },
  other: {
    pokemonRange: [15, 20],
    trainerRange: [20, 30],
    energyRange: [8, 12],
    drawSupportMin: 6,
    searchSupportMin: 6,
    basicPokemonMin: 8,
    retreatCostCeiling: 2,
  },
};

/** "Other" is also the default profile when no archetype was specified at all. */
export function getArchetypeProfile(archetype: StrategyArchetype | null): ArchetypeProfile {
  return PROFILES[archetype ?? "other"];
}
