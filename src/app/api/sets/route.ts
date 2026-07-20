import { NextResponse } from "next/server";
import { pokemonTcgApiProvider, PokemonTcgApiError } from "@/lib/providers/pokemon-tcg-api";
import { getCachedSets, setCachedSets } from "@/lib/cache/card-cache";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

export const GET = withApiErrorHandling(async () => {
  const cached = await getCachedSets();
  if (cached && cached.fresh) {
    return NextResponse.json({ sets: cached.sets });
  }

  try {
    const sets = await pokemonTcgApiProvider.getSets();
    await setCachedSets(sets);
    return NextResponse.json({ sets });
  } catch (error) {
    if (error instanceof PokemonTcgApiError) {
      if (cached) {
        return NextResponse.json({ sets: cached.sets, _stale: true });
      }
      const body: ApiError = {
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "The set list is temporarily unavailable.",
        },
      };
      return NextResponse.json(body, { status: 502 });
    }
    throw error;
  }
});
