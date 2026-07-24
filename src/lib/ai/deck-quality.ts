import type { Card, DeckFormat } from "@/types/card";
import type {
  DeckCardEntry,
  DeckQualityCheck,
  DeckQualityIssue,
  DeckQualityResult,
  DeckStatistics,
  StrategyArchetype,
} from "@/types/deck";
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
  const checks: DeckQualityCheck[] = [];

  /** Records both the pass/fail checklist entry and (on failure) the legacy issue. */
  function record(check: DeckQualityCheck) {
    checks.push(check);
    if (!check.passed) {
      issues.push({ code: check.code, severity: check.severity, message: check.message });
    }
  }

  // --- Hard checks: failing any of these triggers a refinement pass. ---

  {
    const passed = inRange(statistics.totalPokemon, profile.pokemonRange);
    record({
      code: "POKEMON_COUNT_OUT_OF_RANGE",
      severity: "hard",
      label: "Pokémon count",
      passed,
      actual: statistics.totalPokemon,
      target: profile.pokemonRange,
      message: passed
        ? `${statistics.totalPokemon} Pokémon, within the ${profile.pokemonRange[0]}-${profile.pokemonRange[1]} range typical for this archetype.`
        : `${statistics.totalPokemon} Pokémon, outside the ${profile.pokemonRange[0]}-${profile.pokemonRange[1]} range typical for this archetype.`,
    });
  }
  {
    const passed = inRange(statistics.totalTrainer, profile.trainerRange);
    record({
      code: "TRAINER_COUNT_OUT_OF_RANGE",
      severity: "hard",
      label: "Trainer count",
      passed,
      actual: statistics.totalTrainer,
      target: profile.trainerRange,
      message: passed
        ? `${statistics.totalTrainer} Trainer cards, within the ${profile.trainerRange[0]}-${profile.trainerRange[1]} range typical for this archetype.`
        : `${statistics.totalTrainer} Trainer cards, outside the ${profile.trainerRange[0]}-${profile.trainerRange[1]} range typical for this archetype.`,
    });
  }
  {
    const passed = inRange(statistics.totalEnergy, profile.energyRange);
    record({
      code: "ENERGY_COUNT_OUT_OF_RANGE",
      severity: "hard",
      label: "Energy count",
      passed,
      actual: statistics.totalEnergy,
      target: profile.energyRange,
      message: passed
        ? `${statistics.totalEnergy} Energy cards, within the ${profile.energyRange[0]}-${profile.energyRange[1]} range typical for this archetype.`
        : `${statistics.totalEnergy} Energy cards, outside the ${profile.energyRange[0]}-${profile.energyRange[1]} range typical for this archetype.`,
    });
  }
  {
    const passed = statistics.drawSupportCount >= profile.drawSupportMin;
    record({
      code: "LOW_DRAW_SUPPORT",
      severity: "hard",
      label: "Draw support",
      passed,
      actual: statistics.drawSupportCount,
      target: { min: profile.drawSupportMin },
      message: passed
        ? `${statistics.drawSupportCount} draw-support cards, meeting this archetype's minimum of ${profile.drawSupportMin}.`
        : `Only ${statistics.drawSupportCount} draw-support cards; this archetype typically wants at least ${profile.drawSupportMin}.`,
    });
  }
  {
    const passed = statistics.searchSupportCount >= profile.searchSupportMin;
    record({
      code: "LOW_SEARCH_SUPPORT",
      severity: "hard",
      label: "Search support",
      passed,
      actual: statistics.searchSupportCount,
      target: { min: profile.searchSupportMin },
      message: passed
        ? `${statistics.searchSupportCount} search-support cards, meeting this archetype's minimum of ${profile.searchSupportMin}.`
        : `Only ${statistics.searchSupportCount} search-support cards; this archetype typically wants at least ${profile.searchSupportMin}.`,
    });
  }
  {
    const passed = statistics.evolutionStageDistribution.basic >= profile.basicPokemonMin;
    record({
      code: "LOW_BASIC_POKEMON",
      severity: "hard",
      label: "Basic Pokémon",
      passed,
      actual: statistics.evolutionStageDistribution.basic,
      target: { min: profile.basicPokemonMin },
      message: passed
        ? `${statistics.evolutionStageDistribution.basic} Basic Pokémon, meeting this archetype's minimum of ${profile.basicPokemonMin}.`
        : `Only ${statistics.evolutionStageDistribution.basic} Basic Pokémon; this archetype typically wants at least ${profile.basicPokemonMin}.`,
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
    record({
      code: "ENERGY_TYPE_MISMATCH",
      severity: "hard",
      label: "Energy type coverage",
      passed: covered,
      message: covered
        ? `Attack costs (${[...requiredEnergyTypes].join("/")}) are backed by matching Energy in the deck.`
        : `This deck's attacks need ${[...requiredEnergyTypes].join("/")} Energy, but none of the matching type is actually in the deck.`,
    });
  } else {
    record({
      code: "ENERGY_TYPE_MISMATCH",
      severity: "hard",
      label: "Energy type coverage",
      passed: true,
      message: "No colored attack costs to check yet — add attackers to evaluate this.",
    });
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
  record({
    code: "SHALLOW_EVOLUTION_LINE",
    severity: "soft",
    label: "Evolution line depth",
    passed: shallowLines.size === 0,
    message:
      shallowLines.size === 0
        ? "Every evolution line has at least 2 copies of its prior stage."
        : `Only 1 copy of ${[...shallowLines].join(", ")} backing an evolution — a known consistency risk if it's prized or discarded.`,
  });

  // Attacker redundancy: how many distinct "end of line" attackers exist,
  // and does the deck lean entirely on a single one with too few copies.
  const attackerEntries = entries.filter((e) => {
    const card = cardsById[e.cardId];
    return card?.supertype === "Pokémon" && card.attacks.length > 0;
  });
  const attackerNames = new Set(attackerEntries.map((e) => normalizeCardName(e.cardName)));
  let attackerRedundancyOk = true;
  if (attackerNames.size === 1) {
    const onlyAttackerQty = attackerEntries.reduce((s, e) => s + e.quantity, 0);
    attackerRedundancyOk = onlyAttackerQty >= 3;
  }
  record({
    code: "NO_ATTACKER_REDUNDANCY",
    severity: "soft",
    label: "Attacker redundancy",
    passed: attackerRedundancyOk,
    message: attackerRedundancyOk
      ? "More than one way to attack, or enough copies of the single attacking line."
      : "Only one attacking Pokémon line, with fewer than 3 copies — a single prized or discarded copy could strand the whole game plan.",
  });

  // Retreat cost vs. utility.
  let retreatOk = statistics.averageRetreatCost <= profile.retreatCostCeiling;
  if (!retreatOk) {
    const utilityCount = entries.reduce((sum, e) => {
      const card = cardsById[e.cardId];
      return card && isRetreatAidCard(card) ? sum + e.quantity : sum;
    }, 0);
    retreatOk = utilityCount >= 2;
  }
  record({
    code: "HIGH_RETREAT_NO_UTILITY",
    severity: "soft",
    label: "Retreat cost",
    passed: retreatOk,
    actual: Math.round(statistics.averageRetreatCost * 10) / 10,
    target: { min: 0 },
    message: retreatOk
      ? `Average retreat cost (${statistics.averageRetreatCost.toFixed(1)}) is reasonable for this archetype, or supported by retreat-aid cards.`
      : `Average retreat cost (${statistics.averageRetreatCost.toFixed(1)}) is high for this archetype, with little retreat-aid support to compensate.`,
  });

  // Prize-trade balance — informational, never a mistake by itself.
  let multiPrizeCount = 0;
  for (const entry of entries) {
    const card = cardsById[entry.cardId];
    if (card?.supertype === "Pokémon" && card.subtypes.some((s) => MULTI_PRIZE_SUBTYPES.includes(s))) {
      multiPrizeCount += entry.quantity;
    }
  }
  const multiPrizeShare = statistics.totalPokemon > 0 ? multiPrizeCount / statistics.totalPokemon : 0;
  const heavyMultiPrize = multiPrizeShare > 0.6;
  record({
    code: "HEAVY_MULTI_PRIZE",
    severity: "soft",
    label: "Multi-prize balance",
    passed: !heavyMultiPrize,
    message: heavyMultiPrize
      ? "Over 60% of this deck's Pokémon give up multiple prizes when knocked out — a valid archetype choice, worth confirming it's intentional."
      : "Multi-prize Pokémon are a manageable share of this deck's prize-trade risk.",
  });

  void format; // reserved: format-specific quality nuance is not yet used, kept for signature stability

  const passesHardChecks = !issues.some((i) => i.severity === "hard");
  return { issues, checks, passesHardChecks };
}
