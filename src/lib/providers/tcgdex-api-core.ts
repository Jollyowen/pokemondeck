/**
 * TCGdex provider adapter — implements the same CardProvider interface as
 * pokemon-tcg-api-core.ts, so the rest of the app (search, deck builder,
 * AI candidate gathering, review) is unaffected by which upstream is
 * behind it. See DECISIONS.md for the migration rationale.
 *
 * No API key required — TCGdex is free and open, no auth header, no
 * documented per-key rate limit the way pokemontcg.io had. Still paced
 * defensively in the sync script out of general courtesy to a free
 * community-run service, not because a specific limit is documented.
 *
 * Deliberately NOT guarded with `import "server-only"`, for the same
 * reason as pokemon-tcg-api-core.ts: the standalone sync script imports
 * this factory directly, outside the Next.js bundle. The app's own
 * singleton (tcgdex-api.ts) applies the guard at that layer instead.
 */
import type {
  Card,
  CardProvider,
  CardSearchInput,
  CardSearchResult,
  CardSet,
} from "@/types/card";

const BASE_URL = "https://api.tcgdex.net/v2/en";

/**
 * Raw shape per TCGdex's published Card interface
 * (github.com/tcgdex/cards-database/blob/master/interfaces.d.ts) —
 * confirmed against the actual source of truth, not just the docs site,
 * during the migration audit (see DECISIONS.md). `abilities` and
 * `resistances` are both real, optional fields — same shape as
 * `weaknesses`.
 */
type RawCard = {
  id: string;
  name: string;
  localId?: string;
  category?: "Pokemon" | "Trainer" | "Energy";
  illustrator?: string;
  rarity?: string;
  set?: { id: string; name: string };
  image?: string;
  dexId?: number[];
  hp?: number;
  types?: string[];
  evolveFrom?: string;
  description?: string;
  stage?: string;
  suffix?: string;
  trainerType?: string;
  energyType?: string;
  abilities?: Array<{ type: string; name: string; effect: string }>;
  attacks?: Array<{
    cost?: string[];
    name: string;
    effect?: string;
    damage?: string | number;
  }>;
  weaknesses?: Array<{ type: string; value?: string }>;
  resistances?: Array<{ type: string; value?: string }>;
  retreat?: number;
  regulationMark?: string;
  legal?: { standard?: boolean; expanded?: boolean };
  pricing?: {
    tcgplayer?: {
      updated?: string;
      unit?: string;
      normal?: VariantPrices;
      holofoil?: VariantPrices;
      "reverse-holofoil"?: VariantPrices;
      "1st-edition"?: VariantPrices;
      "1st-edition-holofoil"?: VariantPrices;
      unlimited?: VariantPrices;
      "unlimited-holofoil"?: VariantPrices;
    };
  };
};

type VariantPrices = {
  lowPrice?: number;
  midPrice?: number;
  highPrice?: number;
  marketPrice?: number;
  directLowPrice?: number;
};

type RawCardBrief = { id: string; localId: string; name: string; image?: string };

type RawSet = {
  id: string;
  name: string;
  serie?: { id: string; name: string };
  releaseDate?: string;
  cardCount?: { official: number };
};

export class TcgdexApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TcgdexApiError";
  }
}

function mapLegality(legal: boolean | undefined): "legal" | "not_legal" {
  return legal === true ? "legal" : "not_legal";
}

/**
 * TCGdex serves the image as a base path (no extension); the app must
 * append a quality + format suffix itself. "high"/"png" for the large
 * display image, "low"/"webp" for thumbnails — matches the convention
 * shown in TCGdex's own SDK examples (card.getImageURL('high', 'png')).
 */
function buildImageUrl(base: string | undefined, quality: "low" | "high", format: "png" | "webp"): string {
  if (!base) return "";
  return `${base}/${quality}.${format}`;
}

const PREFERRED_PRICE_VARIANT_ORDER = [
  "normal",
  "holofoil",
  "reverse-holofoil",
  "1st-edition",
  "1st-edition-holofoil",
  "unlimited",
  "unlimited-holofoil",
] as const;

export function extractPrice(pricing: RawCard["pricing"]): Card["price"] {
  const tcgplayer = pricing?.tcgplayer;
  if (!tcgplayer) return null;

  const availableKeys = PREFERRED_PRICE_VARIANT_ORDER.filter((key) => key in tcgplayer);
  const variant = availableKeys[0];
  if (!variant) return null;

  const variantPrices = tcgplayer[variant];
  if (!variantPrices) return null;

  const market = variantPrices.marketPrice ?? variantPrices.midPrice ?? null;

  return {
    variant,
    market: market ?? null,
    low: variantPrices.lowPrice ?? null,
    high: variantPrices.highPrice ?? null,
    currency: "USD",
    // TCGdex doesn't return a per-card TCGPlayer product URL the way
    // pokemontcg.io did — leaving null rather than guessing a link.
    url: null,
    updatedAt: tcgplayer.updated ?? null,
  };
}

/**
 * TCGdex splits what pokemontcg.io flattened into one `subtypes` array
 * across three category-specific fields (`stage` for Pokémon,
 * `trainerType` for Trainer, `energyType` for Energy — plus `suffix`,
 * e.g. "ex"/"V", which also behaved like a subtype in the old schema).
 * Reconstructed here so every downstream consumer of `card.subtypes`
 * (deck validation, stats, AI prompts) keeps working unchanged.
 */
function buildSubtypes(raw: RawCard): string[] {
  const subtypes: string[] = [];
  if (raw.stage) subtypes.push(raw.stage);
  if (raw.suffix) subtypes.push(raw.suffix);
  if (raw.trainerType) subtypes.push(raw.trainerType);
  if (raw.energyType) subtypes.push(raw.energyType);
  return subtypes;
}

/**
 * `evolvesTo` has no direct equivalent in TCGdex's schema — only the
 * reverse pointer (`evolveFrom`) exists. Always empty coming out of this
 * normalizer; the sync script derives it afterward via a reverse-index
 * pass over the whole synced catalogue (see scripts/sync-cards.ts). Live
 * single-card fallback fetches (outside the sync script) will also come
 * back with an empty evolvesTo — an accepted, narrow gap for the rare
 * card that was never in a completed sync, consistent with how other
 * sync-only enrichment already works in this app.
 */
export function normalizeCard(raw: RawCard): Card {
  const supertype: Card["supertype"] =
    raw.category === "Pokemon" ? "Pokémon" : raw.category === "Energy" ? "Energy" : "Trainer";

  return {
    id: raw.id,
    provider: "tcgdex",
    name: raw.name,
    number: raw.localId ?? "",
    setId: raw.set?.id ?? "",
    setName: raw.set?.name ?? "",
    imageSmall: buildImageUrl(raw.image, "low", "webp"),
    imageLarge: buildImageUrl(raw.image, "high", "png"),
    supertype,
    subtypes: buildSubtypes(raw),
    types: raw.types ?? [],
    hp: raw.hp ?? null,
    evolvesFrom: raw.evolveFrom ?? null,
    evolvesTo: [], // derived post-sync — see function doc above
    abilities: (raw.abilities ?? []).map((a) => ({
      name: a.name,
      text: a.effect,
      type: a.type,
    })),
    attacks: (raw.attacks ?? []).map((a) => ({
      name: a.name,
      cost: a.cost ?? [],
      // TCGdex doesn't give a precomputed converted energy cost the way
      // pokemontcg.io did — derived from the cost array length, which is
      // what "converted" means for every other TCG energy-cost model.
      convertedEnergyCost: (a.cost ?? []).length,
      damage: a.damage != null ? String(a.damage) : "",
      text: a.effect ?? "",
    })),
    weaknesses: (raw.weaknesses ?? []).map((w) => ({ type: w.type, value: w.value ?? "" })),
    resistances: (raw.resistances ?? []).map((r) => ({ type: r.type, value: r.value ?? "" })),
    // TCGdex gives a single retreat count, not a list of energy icons —
    // reconstruct a same-length Colorless array so convertedRetreatCost
    // (a plain count) and anything reading retreatCost.length keep working.
    retreatCost: raw.retreat ? Array(raw.retreat).fill("Colorless") : [],
    convertedRetreatCost: raw.retreat ?? 0,
    rules: raw.description ? [raw.description] : [],
    rarity: raw.rarity ?? null,
    legalities: {
      standard: mapLegality(raw.legal?.standard),
      expanded: mapLegality(raw.legal?.expanded),
      // Not present in TCGdex's schema. Confirmed unused anywhere in the
      // app's actual DeckFormat logic ("standard" | "expanded" | "all"
      // only) before defaulting this — see DECISIONS.md.
      unlimited: "unknown",
    },
    price: extractPrice(raw.pricing),
  };
}

function normalizeSet(raw: RawSet): CardSet {
  return {
    id: raw.id,
    name: raw.name,
    series: raw.serie?.name ?? "",
    releaseDate: raw.releaseDate ?? "",
  };
}

export function createTcgdexApiProvider(): CardProvider {
  async function tcgdexFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        next: { revalidate: 3600 },
      });
    } catch {
      throw new TcgdexApiError("Failed to reach the TCGdex API", undefined);
    }

    if (!response.ok) {
      throw new TcgdexApiError(`TCGdex API returned ${response.status}`, response.status);
    }

    return (await response.json()) as T;
  }

  /**
   * TCGdex's filtering endpoint is `GET /cards?<field>=<value>` with
   * `like:` / `eq:` style operators per field (see
   * tcgdex.dev/rest/filtering-sorting-pagination), distinct from
   * pokemontcg.io's single Lucene-style `q` param. Mapped field-by-field
   * here rather than trying to build one combined query string, since
   * the two APIs' filter grammars aren't compatible.
   *
   * CRITICAL: an unprefixed value (`field=value`) is TCGdex's *laxist*
   * substring filter, identical to `like:value` — NOT an exact match.
   * A real production sync bug came from this: `set.id=swsh1` (no
   * prefix) also matched `swsh10`, `swsh11`, `swsh12`, `swsh12.5`, etc.,
   * silently pulling every one of those sets' cards into the "swsh1"
   * sync bucket, duplicate-fetching cards across multiple sets and
   * eventually causing a Postgres "ON CONFLICT DO UPDATE... twice"
   * error once two duplicate rows landed in the same write batch. Every
   * field below that needs an EXACT match — category, types, set.id,
   * rarity — must use the `eq:` prefix explicitly. Only `name` is
   * intentionally left as the laxist default, since fuzzy substring
   * matching is the actual desired behavior for name search.
   *
   * NOTE: TCGdex's list endpoint returns `CardBrief` (id/name/image/
   * localId only, no full card data) even when filtered — there is no
   * documented single call that returns full card data AND a total
   * count for pagination in one round trip the way pokemontcg.io's
   * `/cards?q=...` did. This adapter fetches matching briefs, then
   * resolves each to a full card via `/cards/{id}` for the current
   * page only (not the whole result set), and reports `totalCount` as
   * the number of matching briefs. Flagging this as the one part of
   * this adapter that trades a request for a simplicity most other
   * TCGdex-backed apps don't need, since this app's search UI expects a
   * `totalCount` for its Pagination component. Worth revisiting against
   * TCGdex's GraphQL endpoint later, which can express this in one call.
   */
  async function fetchFilteredBriefs(input: CardSearchInput): Promise<RawCardBrief[]> {
    const params: Record<string, string> = {};
    if (input.name?.trim()) params.name = `like:${input.name.trim()}`;
    if (input.supertype) {
      const category = input.supertype === "Pokémon" ? "Pokemon" : input.supertype;
      params.category = `eq:${category}`;
    }
    if (input.pokemonType?.trim()) params.types = `eq:${input.pokemonType.trim()}`;
    if (input.setId?.trim()) params["set.id"] = `eq:${input.setId.trim()}`;
    if (input.rarity?.trim()) params.rarity = `eq:${input.rarity.trim()}`;

    return tcgdexFetch<RawCardBrief[]>("/cards", params);
  }

  const provider: CardProvider = {
    async searchCards(input: CardSearchInput): Promise<CardSearchResult> {
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 24;

      const allBriefs = await fetchFilteredBriefs(input);
      const totalCount = allBriefs.length;
      const pageBriefs = allBriefs.slice((page - 1) * pageSize, page * pageSize);

      const cards = await Promise.all(
        pageBriefs.map(async (brief) => {
          const raw = await tcgdexFetch<RawCard>(`/cards/${encodeURIComponent(brief.id)}`);
          return normalizeCard(raw);
        }),
      );

      return { cards, page, pageSize, totalCount };
    },

    async getCard(cardId: string): Promise<Card | null> {
      try {
        const raw = await tcgdexFetch<RawCard>(`/cards/${encodeURIComponent(cardId)}`);
        return normalizeCard(raw);
      } catch (error) {
        if (error instanceof TcgdexApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },

    async getCards(cardIds: string[]): Promise<Card[]> {
      if (cardIds.length === 0) return [];
      // No documented batch-by-ids endpoint on TCGdex (unlike
      // pokemontcg.io's `id:a OR id:b` trick) — one request per card.
      // Chunked with Promise.all in small batches rather than either
      // full serial (slow) or full parallel (impolite to a free
      // community API) — mirrors the spirit of the old adapter's
      // batching without pretending TCGdex has the same OR-query shape.
      const BATCH_SIZE = 10;
      const results: Card[] = [];
      for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
        const batch = cardIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (id) => {
            try {
              return await provider.getCard(id);
            } catch {
              return null;
            }
          }),
        );
        for (const card of batchResults) {
          if (card) results.push(card);
        }
      }
      return results;
    },

    async getSets(): Promise<CardSet[]> {
      const briefs = await tcgdexFetch<RawSet[]>("/sets");

      // TCGdex's /sets LIST endpoint returns a lightweight brief
      // (id/name/logo/symbol/cardCount) — confirmed via a real sync run
      // that it does NOT include releaseDate, even though the full
      // per-set object does. Every set was syncing with an effectively
      // blank release date as a result, which broke both the "newest
      // set first" dropdown ordering and card search's own "newest
      // first" default (cards inherit set_release_date from here).
      // Fetching each set's detail individually is the fix — one extra
      // request per set, deliberately unpaced beyond a small courtesy
      // delay, since the sync script's own withPacingAndRetry wraps
      // this whole getSets() call as a single unit rather than pacing
      // each internal request the way the per-set card fetch loop does.
      const detailed: CardSet[] = [];
      for (const brief of briefs) {
        try {
          const raw = await tcgdexFetch<RawSet>(`/sets/${encodeURIComponent(brief.id)}`);
          detailed.push(normalizeSet(raw));
        } catch {
          // Best-effort: one set's detail failing shouldn't abort the
          // whole sets fetch. Falls back to the brief with an empty
          // releaseDate — that set will simply sort last until a later
          // sync run succeeds for it.
          detailed.push(normalizeSet(brief));
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
      }

      return detailed;
    },
  };

  return provider;
}
