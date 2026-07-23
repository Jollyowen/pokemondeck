import { NextResponse } from "next/server";
import { pokemonTcgApiProvider, PokemonTcgApiError } from "@/lib/providers/pokemon-tcg-api";
import { getLocalSets, upsertSets } from "@/lib/cards/local-card-repository";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

export const GET = withApiErrorHandling(async () => {
  const local = await getLocalSets();
  if (local.length > 0) {
    return NextResponse.json({ sets: local });
  }

  // Empty local mirror — most likely the sync job hasn't run yet (e.g.
  // right after this feature was first deployed). Fall back to a live
  // fetch so the app isn't stuck with an empty set list in the meantime.
  try {
    const sets = await pokemonTcgApiProvider.getSets();
    await upsertSets(sets);
    return NextResponse.json({ sets });
  } catch (error) {
    if (error instanceof PokemonTcgApiError) {
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
