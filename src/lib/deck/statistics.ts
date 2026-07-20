import type { Card, DeckFormat } from "@/types/card";
import type { DeckCardEntry, DeckStatistics, EvolutionStageDistribution } from "@/types/deck";
import { isDrawSupportCard, isSearchSupportCard } from "@/lib/deck/text-heuristics";

function addToDistribution(distribution: Record<string, number>, key: string, quantity: number): void {
  distribution[key] = (distribution[key] ?? 0) + quantity;
}

/**
 * Computes deck statistics deterministically from already-resolved card
 * data. Entries whose card couldn't be resolved (missing from
 * cardsById — e.g. offline, or a card that's since vanished from the
 * provider) are simply excluded from card-dependent tallies, the same way
 * the validation engine handles unresolved cards.
 */
export function computeDeckStatistics(
  entries: DeckCardEntry[],
  cardsById: Record<string, Card>,
  format: DeckFormat,
): DeckStatistics {
  let totalPokemon = 0;
  let totalTrainer = 0;
  let totalEnergy = 0;
  const pokemonTypeDistribution: Record<string, number> = {};
  const energyTypeDistribution: Record<string, number> = {};
  const evolutionStageDistribution: EvolutionStageDistribution = { basic: 0, stage1: 0, stage2: 0, other: 0 };
  let retreatCostWeightedSum = 0;
  const attackEnergyCostDistribution: Record<number, number> = {};
  let drawSupportCount = 0;
  let searchSupportCount = 0;
  let formatIllegalCount = 0;

  for (const entry of entries) {
    const card = cardsById[entry.cardId];
    if (!card) continue;
    const quantity = entry.quantity;

    if (card.supertype === "Pokémon") {
      totalPokemon += quantity;
      for (const type of card.types) addToDistribution(pokemonTypeDistribution, type, quantity);

      if (card.subtypes.includes("Basic")) evolutionStageDistribution.basic += quantity;
      else if (card.subtypes.includes("Stage 1")) evolutionStageDistribution.stage1 += quantity;
      else if (card.subtypes.includes("Stage 2")) evolutionStageDistribution.stage2 += quantity;
      else evolutionStageDistribution.other += quantity;

      retreatCostWeightedSum += card.convertedRetreatCost * quantity;

      for (const attack of card.attacks) {
        const cost = attack.convertedEnergyCost;
        attackEnergyCostDistribution[cost] = (attackEnergyCostDistribution[cost] ?? 0) + quantity;
      }
    } else if (card.supertype === "Trainer") {
      totalTrainer += quantity;
    } else if (card.supertype === "Energy") {
      totalEnergy += quantity;
      for (const type of card.types) addToDistribution(energyTypeDistribution, type, quantity);
    }

    if (isDrawSupportCard(card)) drawSupportCount += quantity;
    if (isSearchSupportCard(card)) searchSupportCount += quantity;

    if (format !== "all" && card.legalities[format] !== "legal") {
      formatIllegalCount += quantity;
    }
  }

  const averageRetreatCost = totalPokemon > 0 ? retreatCostWeightedSum / totalPokemon : 0;

  return {
    totalPokemon,
    totalTrainer,
    totalEnergy,
    pokemonTypeDistribution,
    energyTypeDistribution,
    evolutionStageDistribution,
    averageRetreatCost,
    attackEnergyCostDistribution,
    drawSupportCount,
    searchSupportCount,
    formatIllegalCount,
    estimatedFields: ["drawSupportCount", "searchSupportCount"],
  };
}
