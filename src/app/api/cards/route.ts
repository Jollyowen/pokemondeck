import { NextRequest, NextResponse } from "next/server";
import { cardSearchSchema } from "@/schemas/card-search";
import { pokemonTcgApiProvider, PokemonTcgApiError } from "@/lib/providers/pokemon-tcg-api";
import { setCachedCards, searchCachedCardsByName } from "@/lib/cache/card-cache";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";
import type { CardSearchResult } from "@/types/card";

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = cardSearchSchema.safeParse(rawParams);

  if (!parsed.success) {
    const body: ApiError = {
      error: {
        code: "INVALID_QUERY",
        message: "One or more search parameters were invalid.",
        details: parsed.error.flatten(),
      },
    };
    return NextResponse.json(body, { status: 400 });
  }

  try {
    const result = await pokemonTcgApiProvider.searchCards(parsed.data);
    // Write-through cache so single-card lookups and offline fallback
    // benefit from every search that runs.
    await setCachedCards(result.cards);
    return NextResponse.json(result satisfies CardSearchResult);
  } catch (error) {
    if (error instanceof PokemonTcgApiError) {
      // Degraded fallback: only meaningful when the user searched by name,
      // since that's the one filter we can approximate against the cache.
      if (parsed.data.name) {
        const fallbackCards = await searchCachedCardsByName(
          parsed.data.name,
          parsed.data.pageSize,
        );
        if (fallbackCards.length > 0) {
          const degraded: CardSearchResult & { degraded: true } = {
            cards: fallbackCards,
            page: 1,
            pageSize: parsed.data.pageSize,
            totalCount: fallbackCards.length,
            degraded: true,
          };
          return NextResponse.json(degraded, { status: 200 });
        }
      }

      const body: ApiError = {
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message:
            "The card catalogue is temporarily unavailable and no matching cached results were found. Please try again shortly.",
        },
      };
      return NextResponse.json(body, { status: 502 });
    }
    throw error;
  }
});
