import "server-only";
import { getServerEnv } from "@/lib/env";
import type {
  Card,
  CardProvider,
  CardSearchInput,
  CardSearchResult,
  CardSet,
} from "@/types/card";

const BASE_URL = "https://api.pokemontcg.io/v2";

/**
 * Raw shapes are intentionally loose (mostly optional) — the provider's
 * data is not guaranteed to include every field on every card, and this
 * is the one place in the codebase allowed to know that.
 */
type RawCard = {
  id: string;
  name: string;
  number?: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  hp?: string;
  evolvesFrom?: string;
  evolvesTo?: string[];
  abilities?: Array<{ name: string; text: string; type: string }>;
  attacks?: Array<{
    name: string;
    cost?: string[];
    convertedEnergyCost?: number;
    damage?: string;
    text?: string;
  }>;
  weaknesses?: Array<{ type: string; value: string }>;
  resistances?: Array<{ type: string; value: string }>;
  retreatCost?: string[];
  convertedRetreatCost?: number;
  rules?: string[];
  set?: { id: string; name: string; series: string; releaseDate: string };
  images?: { small?: string; large?: string };
  legalities?: { standard?: string; expanded?: string; unlimited?: string };
};

type RawSet = {
  id: string;
  name: string;
  series: string;
  releaseDate: string;
};

type RawListResponse<T> = {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
};

type RawSingleResponse<T> = {
  data: T;
};

export class PokemonTcgApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "PokemonTcgApiError";
  }
}

export function mapLegality(raw: string | undefined): "legal" | "not_legal" {
  // Per provider docs: a legality key is simply absent when a card is not
  // legal in that format, and present with "Legal" or "Banned" otherwise.
  // Both "absent" and "Banned" map to not_legal here.
  return raw?.toLowerCase() === "legal" ? "legal" : "not_legal";
}

export function normalizeCard(raw: RawCard): Card {
  const supertype =
    raw.supertype === "Pokémon" || raw.supertype === "Trainer" || raw.supertype === "Energy"
      ? raw.supertype
      : "Trainer"; // defensive fallback; provider only returns these three today

  return {
    id: raw.id,
    provider: "pokemon_tcg_api",
    name: raw.name,
    number: raw.number ?? "",
    setId: raw.set?.id ?? "",
    setName: raw.set?.name ?? "",
    imageSmall: raw.images?.small ?? "",
    imageLarge: raw.images?.large ?? "",
    supertype,
    subtypes: raw.subtypes ?? [],
    types: raw.types ?? [],
    hp: raw.hp ? Number.parseInt(raw.hp, 10) || null : null,
    evolvesFrom: raw.evolvesFrom ?? null,
    evolvesTo: raw.evolvesTo ?? [],
    abilities: (raw.abilities ?? []).map((a) => ({
      name: a.name,
      text: a.text,
      type: a.type,
    })),
    attacks: (raw.attacks ?? []).map((a) => ({
      name: a.name,
      cost: a.cost ?? [],
      convertedEnergyCost: a.convertedEnergyCost ?? 0,
      damage: a.damage ?? "",
      text: a.text ?? "",
    })),
    weaknesses: raw.weaknesses ?? [],
    resistances: raw.resistances ?? [],
    retreatCost: raw.retreatCost ?? [],
    convertedRetreatCost: raw.convertedRetreatCost ?? 0,
    rules: raw.rules ?? [],
    legalities: {
      standard: mapLegality(raw.legalities?.standard),
      expanded: mapLegality(raw.legalities?.expanded),
      unlimited: mapLegality(raw.legalities?.unlimited),
    },
  };
}

function normalizeSet(raw: RawSet): CardSet {
  return {
    id: raw.id,
    name: raw.name,
    series: raw.series,
    releaseDate: raw.releaseDate,
  };
}

/** Escapes a value for safe inclusion inside a quoted Lucene-style phrase. */
function escapePhrase(value: string): string {
  return value.replace(/"/g, '\\"');
}

/**
 * Builds the provider's `q` query string.
 *
 * Deliberately does NOT incorporate `format`: per the format-filter
 * requirement, illegal cards must remain visible (muted, not excluded), so
 * legality filtering happens client-side against each card's own
 * `legalities` object, never as a server-side search restriction.
 */
export function buildSearchQuery(input: CardSearchInput): string {
  const clauses: string[] = [];

  if (input.name?.trim()) {
    const name = input.name.trim();
    clauses.push(
      name.includes(" ") ? `name:"${escapePhrase(name)}"` : `name:${name}*`,
    );
  }
  if (input.supertype) {
    clauses.push(`supertype:"${escapePhrase(input.supertype)}"`);
  }
  if (input.pokemonType?.trim()) {
    clauses.push(`types:${input.pokemonType.trim()}`);
  }
  if (input.setId?.trim()) {
    clauses.push(`set.id:${input.setId.trim()}`);
  }
  if (input.rarity?.trim()) {
    clauses.push(`rarity:"${escapePhrase(input.rarity.trim())}"`);
  }

  return clauses.join(" ");
}

async function pokemonTcgFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const env = getServerEnv();
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "X-Api-Key": env.POKEMON_TCG_API_KEY },
      // Provider data changes infrequently; allow Next.js to cache at the
      // fetch layer in addition to our own database cache.
      next: { revalidate: 3600 },
    });
  } catch (cause) {
    throw new PokemonTcgApiError("Failed to reach the Pokémon TCG API", undefined);
  }

  if (!response.ok) {
    throw new PokemonTcgApiError(
      `Pokémon TCG API returned ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export const pokemonTcgApiProvider: CardProvider = {
  async searchCards(input: CardSearchInput): Promise<CardSearchResult> {
    const query = buildSearchQuery(input);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 24;

    const result = await pokemonTcgFetch<RawListResponse<RawCard>>("/cards", {
      q: query,
      page: String(page),
      pageSize: String(pageSize),
      // "id" is a stable, unique tiebreaker. Sorting by name alone leaves
      // ties (many cards genuinely share the same name across printings)
      // in backend-dependent order, which can shuffle between requests and
      // cause pagination to skip or duplicate results across pages.
      orderBy: "name,id",
    });

    return {
      cards: result.data.map(normalizeCard),
      page: result.page,
      pageSize: result.pageSize,
      totalCount: result.totalCount,
    };
  },

  async getCard(cardId: string): Promise<Card | null> {
    try {
      const result = await pokemonTcgFetch<RawSingleResponse<RawCard>>(
        `/cards/${encodeURIComponent(cardId)}`,
        {},
      );
      return normalizeCard(result.data);
    } catch (error) {
      if (error instanceof PokemonTcgApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  async getCards(cardIds: string[]): Promise<Card[]> {
    if (cardIds.length === 0) return [];
    // The provider has no batch-by-id endpoint; an OR query over ids is
    // the documented way to fetch several specific cards in one call.
    const query = cardIds.map((id) => `id:${id}`).join(" OR ");
    const result = await pokemonTcgFetch<RawListResponse<RawCard>>("/cards", {
      q: query,
      pageSize: String(Math.min(cardIds.length, 250)),
    });
    return result.data.map(normalizeCard);
  },

  async getSets(): Promise<CardSet[]> {
    const result = await pokemonTcgFetch<RawListResponse<RawSet>>("/sets", {
      orderBy: "-releaseDate",
      pageSize: "250",
    });
    return result.data.map(normalizeSet);
  },
};
