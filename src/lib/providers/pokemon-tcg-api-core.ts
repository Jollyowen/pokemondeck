/**
 * Deliberately NOT guarded with `import "server-only"`, unlike
 * pokemon-tcg-api.ts which re-exports everything from here. That guard
 * exists to stop this code from being bundled into client-side JS — a
 * real concern for the app itself, but not for the standalone sync
 * script (scripts/sync-cards.ts), which runs outside the Next.js bundle
 * entirely and needs to import this factory directly. Nothing here
 * touches a secret on its own — API keys are only ever passed in
 * explicitly via the `getApiKey` callback, never read from the
 * environment by this file itself.
 */
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
  rarity?: string;
  set?: { id: string; name: string; series: string; releaseDate: string };
  images?: { small?: string; large?: string };
  legalities?: { standard?: string; expanded?: string; unlimited?: string };
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<string, { low?: number; mid?: number; high?: number; market?: number }>;
  };
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

const PREFERRED_PRICE_VARIANT_ORDER = [
  "normal",
  "holofoil",
  "reverseHolofoil",
  "1stEditionNormal",
  "1stEditionHolofoil",
  "unlimited",
  "unlimitedHolofoil",
];

export function extractPrice(tcgplayer: RawCard["tcgplayer"]): Card["price"] {
  const prices = tcgplayer?.prices;
  if (!prices) return null;

  const availableKeys = Object.keys(prices);
  if (availableKeys.length === 0) return null;

  const variant =
    PREFERRED_PRICE_VARIANT_ORDER.find((key) => key in prices) ?? availableKeys[0]!;
  const variantPrices = prices[variant];
  if (!variantPrices) return null;

  const market = variantPrices.market ?? variantPrices.mid ?? null;

  return {
    variant,
    market: market ?? null,
    low: variantPrices.low ?? null,
    high: variantPrices.high ?? null,
    currency: "USD",
    url: tcgplayer?.url ?? null,
    updatedAt: tcgplayer?.updatedAt ?? null,
  };
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
    rarity: raw.rarity ?? null,
    legalities: {
      standard: mapLegality(raw.legalities?.standard),
      expanded: mapLegality(raw.legalities?.expanded),
      unlimited: mapLegality(raw.legalities?.unlimited),
    },
    price: extractPrice(raw.tcgplayer),
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

/**
 * Builds a provider instance for a given API key, resolved lazily (only
 * when a method actually runs, not at call time of this factory itself)
 * so it works both for the app's own lazily-configured environment AND
 * for standalone contexts like the sync script, which reads the key
 * directly from process.env rather than through the app's full env
 * validation (which requires many unrelated app secrets the sync script
 * has no reason to need).
 */
export function createPokemonTcgApiProvider(getApiKey: () => string): CardProvider {
  async function pokemonTcgFetch<T>(path: string, params: Record<string, string>): Promise<T> {
    const apiKey = getApiKey();
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "X-Api-Key": apiKey },
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

  const provider: CardProvider = {
    async searchCards(input: CardSearchInput): Promise<CardSearchResult> {
      const query = buildSearchQuery(input);
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 24;

      const result = await pokemonTcgFetch<RawListResponse<RawCard>>("/cards", {
        q: query,
        page: String(page),
        pageSize: String(pageSize),
        // "id" is a stable, unique tiebreaker for cards released on the same
        // date, for the same pagination-stability reason as before. Ordering
        // by release date (newest first) rather than name also means a
        // name-based lookup naturally surfaces a Pokémon's most recent
        // printing first — the one most likely to be legal in the current
        // format — rather than depending on alphabetical set-ID ordering,
        // which has no relationship to recency at all.
        orderBy: "-set.releaseDate,id",
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

      // Chunked rather than one large OR query over every ID at once: a
      // generated deck can easily need 20-40+ distinct IDs resolved in one
      // call, and a single mega-query is exactly the kind of thing that can
      // silently drop a subset of clauses under some provider-side limit,
      // with no error — just fewer results than requested. Smaller batches
      // are far less likely to hit whatever that limit is.
      const BATCH_SIZE = 20;
      const batches: string[][] = [];
      for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
        batches.push(cardIds.slice(i, i + BATCH_SIZE));
      }

      const results: Card[] = [];
      for (const batch of batches) {
        const query = batch.map((id) => `id:${id}`).join(" OR ");
        const result = await pokemonTcgFetch<RawListResponse<RawCard>>("/cards", {
          q: query,
          pageSize: String(batch.length),
        });
        results.push(...result.data.map(normalizeCard));
      }

      // Fallback: if any requested ID didn't come back from its batch (the
      // exact failure mode this is defending against), retry it individually
      // via the simpler single-card endpoint before giving up on it.
      const foundIds = new Set(results.map((c) => c.id));
      const stillMissing = cardIds.filter((id) => !foundIds.has(id));
      if (stillMissing.length > 0) {
        const individualResults = await Promise.all(
          stillMissing.map(async (id) => {
            try {
              return await provider.getCard(id);
            } catch {
              return null;
            }
          }),
        );
        for (const card of individualResults) {
          if (card) results.push(card);
        }
      }

      return results;
    },

    async getSets(): Promise<CardSet[]> {
      const result = await pokemonTcgFetch<RawListResponse<RawSet>>("/sets", {
        orderBy: "-releaseDate",
        pageSize: "250",
      });
      return result.data.map(normalizeSet);
    },
  };

  return provider;
}

