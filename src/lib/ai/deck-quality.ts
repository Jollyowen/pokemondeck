import type { Card, DeckFormat } from "@/types/card";
import type { DeckCardEntry, DeckQualityIssue, DeckQualityResult, DeckStatistics, StrategyArchetype } from "@/types/deck";
import { getArchetypeProfile } from "@/lib/ai/archetype-profiles";
import { normalizeCardName } from "@/lib/deck/normalize-name";
import { inferBasicEnergyType } from "@/lib/deck/validate";

const MULTI_PRIZE_SUBTYPES = ["ex", "EX", "V", "VMAX", "VSTAR", "GX"];

function inRange(value: number, [min, max]: [number, number]): boolean {
  return value >= min && value <= max;
}

/** Rough, deliberately conservative text check for retreat-aid utility cards (Switch-style effects). */
function isRetreatAidCard(card: Pick<Card, "rules">): boolean {
  return card.rules.some((r) => /\bswitch\b/i.test(r) || /return .* to your hand/i.test(r));
}

export function computeDeckQuality(
  entries: DeckCardEntry[],
  cardsById: Record<string, Card>,
  statistics: DeckStatistics,
  archetype: StrategyArchetype | null,
  format: DeckFormat,
): DeckQualityResult {
  const profile = getArchetypeProfile(archetype);
  const issues: DeckQualityIssue[] = [];

  // --- Hard checks: failing any of these triggers a refinement pass. ---

  if (!inRange(statistics.totalPokemon, profile.pokemonRange)) {
    issues.push({
      code: "POKEMON_COUNT_OUT_OF_RANGE",
      severity: "hard",
      message: `${statistics.totalPokemon} Pokémon, outside the ${profile.pokemonRange[0]}-${profile.pokemonRange[1]} range typical for this archetype.`,
    });
  }
  if (!inRange(statistics.totalTrainer, profile.trainerRange)) {
    issues.push({
      code: "TRAINER_COUNT_OUT_OF_RANGE",
      severity: "hard",
      message: `${statistics.totalTrainer} Trainer cards, outside the ${profile.trainerRange[0]}-${profile.trainerRange[1]} range typical for this archetype.`,
    });
  }
  if (!inRange(statistics.totalEnergy, profile.energyRange)) {
    issues.push({
      code: "ENERGY_COUNT_OUT_OF_RANGE",
      severity: "hard",
      message: `${statistics.totalEnergy} Energy cards, outside the ${profile.energyRange[0]}-${profile.energyRange[1]} range typical for this archetype.`,
    });
  }
  if (statistics.drawSupportCount < profile.drawSupportMin) {
    issues.push({
      code: "LOW_DRAW_SUPPORT",
      severity: "hard",
      message: `Only ${statistics.drawSupportCount} draw-support cards; this archetype typically wants at least ${profile.drawSupportMin}.`,
    });
  }
  if (statistics.searchSupportCount < profile.searchSupportMin) {
    issues.push({
      code: "LOW_SEARCH_SUPPORT",
      severity: "hard",
      message: `Only ${statistics.searchSupportCount} search-support cards; this archetype typically wants at least ${profile.searchSupportMin}.`,
    });
  }
  if (statistics.evolutionStageDistribution.basic < profile.basicPokemonMin) {
    issues.push({
      code: "LOW_BASIC_POKEMON",
      severity: "hard",
      message: `Only ${statistics.evolutionStageDistribution.basic} Basic Pokémon; this archetype typically wants at least ${profile.basicPokemonMin}.`,
    });
  }

  // Energy type coverage: every non-Colorless cost type an attack actually
  // needs should have at least one matching Energy card in the deck.
  const requiredEnergyTypes = new Set<string>();
  for (const entry of entries) {
    const card = cardsById[entry.cardId];
    if (!card || card.supertype !== "Pokémon") continue;
    for (const attack of card.attacks) {
      for (const cost of attack.cost) {
        if (cost !== "Colorless") requiredEnergyTypes.add(cost);
      }
    }
  }
  const presentEnergyTypes = new Set<string>();
  for (const entry of entries) {
    const card = cardsById[entry.cardId];
    if (!card || card.supertype !== "Energy") continue;
    // card.types is empty for most real Basic Energy cards from
    // TCGdex — see isBasicEnergy's doc comment in validate.ts. Without
    // this fallback, this check almost certainly false-flagged
    // ENERGY_TYPE_MISMATCH on most generated decks regardless of
    // whether the right Energy was actually present, since a deck's
    // Fire Energy cards contributed nothing to presentEnergyTypes.
    if (card.types.length > 0) {
      for (const type of card.types) presentEnergyTypes.add(type);
    } else {
      const inferredType = inferBasicEnergyType(card);
      if (inferredType) presentEnergyTypes.add(inferredType);
    }
  }
  if (requiredEnergyTypes.size > 0) {
    const covered = [...requiredEnergyTypes].some((t) => presentEnergyTypes.has(t));
    if (!covered) {
      issues.push({
        code: "ENERGY_TYPE_MISMATCH",
        severity: "hard",
        message: `This deck's attacks need ${[...requiredEnergyTypes].join("/")} Energy, but none of the matching type is actually in the deck.`,
      });
    }
  }

  // --- Soft checks: informational only, never trigger a refinement pass. ---

  // Evolution depth: every Stage 1/2 should have >= 2 copies of its
  // immediate prior stage, not just >= 1 (ensureEvolutionPrerequisites
  // guarantees presence at construction time, not depth).
  const nameQuantities = new Map<string, number>();
  for (const entry of entries) {
    const card = cardsById[entry.cardId];
    if (!card) continue;
    const key = normalizeCardName(card.name);
    nameQuantities.set(key, (nameQuantities.get(key) ?? 0) + entry.quantity);
  }
  const shallowLines = new Set<string>();
  for (const entry of entries) {
    const card = cardsById[entry.cardId];
    if (!card?.evolvesFrom) continue;
    const priorQty = nameQuantities.get(normalizeCardName(card.evolvesFrom)) ?? 0;
    if (priorQty > 0 && priorQty < 2) shallowLines.add(card.evolvesFrom);
  }
  if (shallowLines.size > 0) {
    issues.push({
      code: "SHALLOW_EVOLUTION_LINE",
      severity: "soft",
      message: `Only 1 copy of ${[...shallowLines].join(", ")} backing an evolution — a known consistency risk if it's prized or discarded.`,
    });
  }

  // Attacker redundancy: how many distinct "end of line" attackers exist,
  // and does the deck lean entirely on a single one with too few copies.
  const attackerEntries = entries.filter((e) => {
    const card = cardsById[e.cardId];
    return card?.supertype === "Pokémon" && card.attacks.length > 0;
  });
  const attackerNames = new Set(attackerEntries.map((e) => normalizeCardName(e.cardName)));
  if (attackerNames.size === 1) {
    const onlyAttackerQty = attackerEntries.reduce((s, e) => s + e.quantity, 0);
    if (onlyAttackerQty < 3) {
      issues.push({
        code: "NO_ATTACKER_REDUNDANCY",
        severity: "soft",
        message: "Only one attacking Pokémon line, with fewer than 3 copies — a single prized or discarded copy could strand the whole game plan.",
      });
    }
  }

  // Retreat cost vs. utility.
  if (statistics.averageRetreatCost > profile.retreatCostCeiling) {
    const utilityCount = entries.reduce((sum, e) => {
      const card = cardsById[e.cardId];
      return card && isRetreatAidCard(card) ? sum + e.quantity : sum;
    }, 0);
    if (utilityCount < 2) {
      issues.push({
        code: "HIGH_RETREAT_NO_UTILITY",
        severity: "soft",
        message: `Average retreat cost (${statistics.averageRetreatCost.toFixed(1)}) is high for this archetype, with little retreat-aid support to compensate.`,
      });
    }
  }

  // Prize-trade balance — informational, never a mistake by itself.
  let multiPrizeCount = 0;
  for (const entry of entries) {
    const card = cardsById[entry.cardId];
    if (card?.supertype === "Pokémon" && card.subtypes.some((s) => MULTI_PRIZE_SUBTYPES.includes(s))) {
      multiPrizeCount += entry.quantity;
    }
  }
  if (statistics.totalPokemon > 0 && multiPrizeCount / statistics.totalPokemon > 0.6) {
    issues.push({
      code: "HEAVY_MULTI_PRIZE",
      severity: "soft",
      message: "Over 60% of this deck's Pokémon give up multiple prizes when knocked out — a valid archetype choice, worth confirming it's intentional.",
    });
  }

  void format; // reserved: format-specific quality nuance is not yet used, kept for signature stability

  const passesHardChecks = !issues.some((i) => i.severity === "hard");
  return { issues, passesHardChecks };
}
