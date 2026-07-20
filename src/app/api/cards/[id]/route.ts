import { NextRequest, NextResponse } from "next/server";
import { pokemonTcgApiProvider, PokemonTcgApiError } from "@/lib/providers/pokemon-tcg-api";
import { getCachedCard, setCachedCards } from "@/lib/cache/card-cache";
import type { ApiError } from "@/types/api";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const cached = await getCachedCard(id);
  if (cached && cached.fresh) {
    return NextResponse.json(cached.card);
  }

  try {
    const card = await pokemonTcgApiProvider.getCard(id);
    if (!card) {
      const body: ApiError = {
        error: { code: "CARD_NOT_FOUND", message: `No card found with id "${id}".` },
      };
      return NextResponse.json(body, { status: 404 });
    }
    await setCachedCards([card]);
    return NextResponse.json(card);
  } catch (error) {
    if (error instanceof PokemonTcgApiError) {
      // Serve stale cache rather than fail outright, per the requirement
      // that previously cached records remain visible during an outage.
      if (cached) {
        return NextResponse.json({ ...cached.card, _stale: true });
      }
      const body: ApiError = {
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "The card catalogue is temporarily unavailable and this card has not been cached yet.",
        },
      };
      return NextResponse.json(body, { status: 502 });
    }
    throw error;
  }
}
