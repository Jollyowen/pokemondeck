import type { DeckFormat } from "@/types/card";

export type DeckStatus = "draft" | "complete" | "format_legal";

export type DeckCardEntry = {
  cardId: string;
  cardName: string;
  quantity: number;
};

export type StrategyArchetype = "aggro" | "control" | "mill" | "other";

export type Deck = {
  id: string;
  ownerId: string;
  name: string;
  format: DeckFormat;
  status: DeckStatus;
  shareEnabled: boolean;
  shareToken: string | null;
  cards: DeckCardEntry[];
  strategyArchetype: StrategyArchetype | null;
  strategyNotes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type DeckValidationIssueCode =
  | "TOO_FEW_CARDS"
  | "TOO_MANY_CARDS"
  | "COPY_LIMIT_EXCEEDED"
  | "SPECIAL_COPY_LIMIT_EXCEEDED"
  | "NO_BASIC_POKEMON"
  | "CARD_NOT_FOUND"
  | "FORMAT_ILLEGAL";

export type DeckValidationIssue = {
  code: DeckValidationIssueCode;
  severity: "error" | "warning";
  message: string;
  cardIds?: string[];
};

export type DeckValidationResult = {
  status: DeckStatus;
  issues: DeckValidationIssue[];
};

export type DeckReviewCard = {
  id: string;
  name: string;
  count: number;
  supertype: string;
  subtypes: string[];
  types: string[];
  hp: number | null;
  evolvesFrom: string | null;
  abilities: Array<{ name: string; text: string }>;
  attacks: Array<{
    name: string;
    cost: string[];
    convertedEnergyCost: number;
    damage: string;
    text: string;
  }>;
  retreatCost: number;
  weaknesses: string[];
  resistances: string[];
  rules: string[];
  legalInSelectedFormat: boolean | null;
};

export type DeckReviewInput = {
  format: DeckFormat;
  cards: DeckReviewCard[];
  candidateCards: DeckReviewCard[];
  /** The deck owner's own stated goal, e.g. "fast aggro" or "control with disruption". */
  strategyArchetype: StrategyArchetype | null;
  strategyNotes: string | null;
};

export type DeckReviewIssueCategory =
  | "strategy"
  | "consistency"
  | "energy"
  | "evolution"
  | "draw_search"
  | "legality"
  | "retreat"
  | "other";

export type DeckReviewResult = {
  summary: string;
  strengths: Array<{
    title: string;
    explanation: string;
    evidenceCardIds: string[];
  }>;
  issues: Array<{
    category: DeckReviewIssueCategory;
    severity: "low" | "medium" | "high";
    title: string;
    explanation: string;
    evidenceCardIds: string[];
  }>;
  suggestedSwaps: Array<{
    remove: Array<{ cardId: string; count: number }>;
    add: Array<{ cardId: string; count: number }>;
    reason: string;
  }>;
  confidence: "low" | "medium" | "high";
  limitations: string[];
};

export interface DeckReviewProvider {
  reviewDeck(input: DeckReviewInput): Promise<DeckReviewResult>;
}

export type DeckGenerationInput = {
  format: DeckFormat;
  strategyArchetype: StrategyArchetype | null;
  pokemonName: string;
  strategyNotes: string | null;
  candidateCards: DeckReviewCard[];
  /** When present, compilation is scoped to this plan rather than improvising the whole shape. */
  plan?: DeckPlan;
  /** When present, this is a refinement pass: revise the previous attempt to address these specific gaps. */
  refinement?: { previousCards: Array<{ cardId: string; count: number }>; feedback: string[] };
};

export type DeckGenerationResult = {
  deckName: string;
  explanation: string;
  cards: Array<{ cardId: string; count: number }>;
};

export type DeckPlan = {
  attackerLine: string[];
  secondaryLines: string[][];
  targetPokemon: number;
  targetTrainer: number;
  targetEnergy: number;
  energyTypes: string[];
  trainerRoleTargets: { draw: number; search: number; utility: number };
  justification: string;
};

export type CandidatePoolSummary = {
  totalCandidates: number;
  drawSupportCandidates: number;
  searchSupportCandidates: number;
  otherTrainerCandidates: number;
  pokemonCandidatesByType: Record<string, number>;
  energyTypesAvailable: string[];
  evolutionLineNamesAvailable: string[];
};

export type DeckPlanInput = {
  format: DeckFormat;
  strategyArchetype: StrategyArchetype | null;
  pokemonName: string;
  strategyNotes: string | null;
  poolSummary: CandidatePoolSummary;
};

export interface DeckGenerationProvider {
  generateDeck(input: DeckGenerationInput): Promise<DeckGenerationResult>;
  planDeck(input: DeckPlanInput): Promise<DeckPlan>;
}

export type DeckQualityIssueCode =
  | "POKEMON_COUNT_OUT_OF_RANGE"
  | "TRAINER_COUNT_OUT_OF_RANGE"
  | "ENERGY_COUNT_OUT_OF_RANGE"
  | "LOW_DRAW_SUPPORT"
  | "LOW_SEARCH_SUPPORT"
  | "LOW_BASIC_POKEMON"
  | "ENERGY_TYPE_MISMATCH"
  | "SHALLOW_EVOLUTION_LINE"
  | "NO_ATTACKER_REDUNDANCY"
  | "HIGH_RETREAT_NO_UTILITY"
  | "HEAVY_MULTI_PRIZE";

export type DeckQualityIssue = {
  code: DeckQualityIssueCode;
  /** hard: contributes to failing the pass/fail gate that triggers an AI refinement pass. soft: informational only. */
  severity: "hard" | "soft";
  message: string;
};

export type DeckQualityResult = {
  issues: DeckQualityIssue[];
  passesHardChecks: boolean;
};

export type EvolutionStageDistribution = {
  basic: number;
  stage1: number;
  stage2: number;
  other: number;
};

export type DeckStatistics = {
  totalPokemon: number;
  totalTrainer: number;
  totalEnergy: number;
  pokemonTypeDistribution: Record<string, number>;
  energyTypeDistribution: Record<string, number>;
  evolutionStageDistribution: EvolutionStageDistribution;
  averageRetreatCost: number;
  attackEnergyCostDistribution: Record<number, number>;
  drawSupportCount: number;
  searchSupportCount: number;
  formatIllegalCount: number;
  /** Statistics whose value depends on interpreting free text, not just structured fields. */
  estimatedFields: string[];
};
