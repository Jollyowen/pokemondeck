import type { Card } from "@/types/card";
import type { CandidatePoolSummary } from "@/types/deck";
import { isDrawSupportCard, isSearchSupportCard } from "@/lib/deck/text-heuristics";
import { getEvolutionLineNames } from "@/lib/deck/evolution-line";

export function buildCandidatePoolSummary(candidates: Card[], targetCard: Card): CandidatePoolSummary {
  let drawSupportCandidates = 0;
  let searchSupportCandidates = 0;
  let otherTrainerCandidates = 0;
  const pokemonCandidatesByType: Record<string, number> = {};
  const energyTypesAvailable = new Set<string>();

  for (const card of candidates) {
    if (card.supertype === "Trainer") {
      if (isDrawSupportCard(card)) drawSupportCandidates += 1;
      else if (isSearchSupportCard(card)) searchSupportCandidates += 1;
      else otherTrainerCandidates += 1;
    } else if (card.supertype === "Pokémon") {
      for (const type of card.types) {
        pokemonCandidatesByType[type] = (pokemonCandidatesByType[type] ?? 0) + 1;
      }
    } else if (card.supertype === "Energy" && card.subtypes.includes("Basic")) {
      for (const type of card.types) energyTypesAvailable.add(type);
    }
  }

  const evolutionNames = getEvolutionLineNames(targetCard);
  const availableNames = new Set(candidates.map((c) => c.name));
  const evolutionLineNamesAvailable = evolutionNames.filter((n) => availableNames.has(n));

  return {
    totalCandidates: candidates.length,
    drawSupportCandidates,
    searchSupportCandidates,
    otherTrainerCandidates,
    pokemonCandidatesByType,
    energyTypesAvailable: [...energyTypesAvailable],
    evolutionLineNamesAvailable,
  };
}
