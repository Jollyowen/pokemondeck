export type CardLegality = "legal" | "not_legal" | "unknown";

export type Card = {
  id: string;
  provider: "pokemon_tcg_api";
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
  legalities: {
    standard: CardLegality;
    expanded: CardLegality;
    unlimited: CardLegality;
  };
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
