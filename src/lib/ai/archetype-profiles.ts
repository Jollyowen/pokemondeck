import type { StrategyArchetype } from "@/types/deck";

export type ArchetypeProfile = {
  pokemonRange: [number, number];
  trainerRange: [number, number];
  energyRange: [number, number];
  drawSupportMin: number;
  searchSupportMin: number;
  basicPokemonMin: number;
  retreatCostCeiling: number;
  /**
   * Qualitative battle-style priorities, surfaced to the model alongside
   * the numeric ranges above (see archetypeTargets in plan-prompt.ts /
   * generation-prompt.ts). Without this, the model only ever saw a bare
   * label like "aggro" and had to infer what that actually means for
   * card selection from general knowledge — this makes the intended
   * strategy explicit, per the approved deck-building rules doc.
   */
  strategyDescription: string;
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
    strategyDescription:
      "Aggro/Beatdown: apply pressure quickly and consistently. Establish the primary Pokémon fast, accelerate Energy attachment where possible, maximise reliable damage output, and maintain enough consistency to attack every turn. Favour Trainers that improve setup, Energy access, damage output and board development. Minimise cards that don't contribute to applying pressure or maintaining tempo.",
  },
  control: {
    pokemonRange: [10, 15],
    trainerRange: [25, 32],
    energyRange: [10, 14],
    drawSupportMin: 8,
    searchSupportMin: 6,
    basicPokemonMin: 8,
    retreatCostCeiling: 2.5,
    strategyDescription:
      "Control/Stall: disrupt the opponent and prevent them executing their strategy efficiently. Use disruption (hand, resources, Energy, board state), defensive effects and recovery to prolong the game and make it hard for the opponent to take Prizes or attack. The primary Pokémon should contribute meaningfully to the control strategy, not just be a powerful attacker. Include sufficient resource recovery and defensive options to sustain the strategy over a longer game. Avoid excessive offensive cards that don't contribute to the control plan.",
  },
  mill: {
    pokemonRange: [8, 12],
    trainerRange: [34, 42],
    energyRange: [7, 11],
    drawSupportMin: 4,
    searchSupportMin: 4,
    basicPokemonMin: 6,
    retreatCostCeiling: 2.5,
    strategyDescription:
      "Mill: reduce the opponent's deck to zero cards and win through deck-out where the rules allow. Include cards that reliably discard or otherwise remove cards from the opponent's deck. Maximise consistency in accessing the primary Pokémon and the deck's milling effects. Include disruption that prevents the opponent from rebuilding their resources or drawing through their deck too quickly. Include defensive and recovery options that let the deck survive long enough to execute the mill strategy. Don't treat conventional damage as the primary win condition unless it directly supports the mill strategy.",
  },
  other: {
    pokemonRange: [15, 20],
    trainerRange: [20, 30],
    energyRange: [8, 12],
    drawSupportMin: 6,
    searchSupportMin: 6,
    basicPokemonMin: 8,
    retreatCostCeiling: 2,
    strategyDescription:
      "No specific battle style was chosen. Build a balanced, coherent deck that lets the primary Pokémon execute its intended role effectively, without committing to an extreme aggro, control or mill game plan.",
  },
};

/** "Other" is also the default profile when no archetype was specified at all. */
export function getArchetypeProfile(archetype: StrategyArchetype | null): ArchetypeProfile {
  return PROFILES[archetype ?? "other"];
}
