import type { Card } from "@/types/card";
import type { CandidatePoolSummary } from "@/types/deck";
import { isDrawSupportCard, isSearchSupportCard } from "@/lib/deck/text-heuristics";
import { getEvolutionLineNames } from "@/lib/deck/evolution-line";
import { isBasicEnergy, inferBasicEnergyType } from "@/lib/deck/validate";

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
    } else if (isBasicEnergy(card)) {
      // card.types is empty for most Energy cards from TCGdex — see
      // isBasicEnergy's doc comment — so this can't just loop over
      // card.types the way the Pokémon branch above does. Falls back to
      // parsing the type out of the name via the same shared helper the
      // copy-limit check uses, rather than silently reporting zero
      // available energy types regardless of what's actually there.
      const inferredType = inferBasicEnergyType(card);
      if (inferredType) energyTypesAvailable.add(inferredType);
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
