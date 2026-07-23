import { NextRequest, NextResponse } from "next/server";
import { pokemonTcgApiProvider, PokemonTcgApiError } from "@/lib/providers/pokemon-tcg-api";
import { getLocalCard, upsertCard } from "@/lib/cards/local-card-repository";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

export const GET = withApiErrorHandling(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  const local = await getLocalCard(id);
  if (local) {
    return NextResponse.json(local);
  }

  // Not in the local mirror yet — likely added to the provider's
  // catalogue since the last sync run. Live-fetch as a fallback, and
  // write it back locally so it's a cache hit next time.
  try {
    const card = await pokemonTcgApiProvider.getCard(id);
    if (!card) {
      const body: ApiError = {
        error: { code: "CARD_NOT_FOUND", message: `No card found with id "${id}".` },
      };
      return NextResponse.json(body, { status: 404 });
    }
    await upsertCard(card);
    return NextResponse.json(card);
  } catch (error) {
    if (error instanceof PokemonTcgApiError) {
      const body: ApiError = {
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "This card isn't in the local catalogue yet and the live catalogue is temporarily unavailable.",
        },
      };
      return NextResponse.json(body, { status: 502 });
    }
    throw error;
  }
});
