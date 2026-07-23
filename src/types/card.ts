export type CardLegality = "legal" | "not_legal" | "unknown";

export type CardPrice = {
  variant: string;
  market: number | null;
  low: number | null;
  high: number | null;
  currency: "USD";
  url: string | null;
  updatedAt: string | null;
};

export type Card = {
  id: string;
  // "pokemon_tcg_api" kept for cards synced before the TCGdex migration
  // and never re-synced; not written by any provider going forward.
  provider: "pokemon_tcg_api" | "tcgdex";
  name: string;
  number: string;
  setId: string;
  setName: string;
  imageSmall: string;
  imageLarge: string;
  supertype: "Pokémon" | "Trainer" | "Energy";
  subtypes: string[];
  types: string[];
  hp: number | null;
  evolvesFrom: string | null;
  evolvesTo: string[];
  abilities: Array<{
    name: string;
    text: string;
    type: string;
  }>;
  attacks: Array<{
    name: string;
    cost: string[];
    convertedEnergyCost: number;
    damage: string;
    text: string;
  }>;
  weaknesses: Array<{
    type: string;
    value: string;
  }>;
  resistances: Array<{
    type: string;
    value: string;
  }>;
  retreatCost: string[];
  convertedRetreatCost: number;
  rules: string[];
  rarity: string | null;
  legalities: {
    standard: CardLegality;
    expanded: CardLegality;
    unlimited: CardLegality;
  };
  /**
   * Display-only. Never included in the AI review payload (see
   * review-cards.ts, which maps an explicit allowlist of fields, not a
   * spread) — the brief specifically excludes price data from what's
   * sent to the model.
   */
  price: CardPrice | null;
};

export type CardSet = {
  id: string;
  name: string;
  series: string;
  releaseDate: string;
};

export type DeckFormat = "standard" | "expanded" | "all";

export type CardSearchInput = {
  name?: string;
  supertype?: Card["supertype"];
  pokemonType?: string;
  setId?: string;
  rarity?: string;
  format?: DeckFormat;
  page?: number;
  pageSize?: number;
};

export type CardSearchResult = {
  cards: Card[];
  page: number;
  pageSize: number;
  totalCount: number;
};

/**
 * The rest of the application depends on this interface, never on
 * Pokémon TCG API response types directly. This keeps provider-specific
 * logic isolated to the adapter implementation.
 */
export interface CardProvider {
  searchCards(input: CardSearchInput): Promise<CardSearchResult>;
  getCard(cardId: string): Promise<Card | null>;
  getCards(cardIds: string[]): Promise<Card[]>;
  getSets(): Promise<CardSet[]>;
}
