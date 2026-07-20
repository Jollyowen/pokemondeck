import { NextRequest, NextResponse } from "next/server";
import { getSharedDeckByToken } from "@/lib/deck/repository";
import { resolveDeckCards } from "@/lib/deck/resolve-cards";
import { computeDeckValidation } from "@/lib/deck/validate";
import { computeDeckStatistics } from "@/lib/deck/statistics";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: { params: Promise<{ token: string }> }) => {
    const { token } = await params;

    const deck = await getSharedDeckByToken(token);
    if (!deck) {
      const error: ApiError = {
        error: {
          code: "SHARED_DECK_NOT_FOUND",
          message: "This share link is no longer valid.",
        },
      };
      return NextResponse.json(error, { status: 404 });
    }

    const { cardsById, missingCardIds } = await resolveDeckCards(deck.cards);
    const validation = computeDeckValidation(deck.cards, cardsById, missingCardIds, deck.format);
    const statistics = computeDeckStatistics(deck.cards, cardsById, deck.format);

    // `deck` here is already the narrow PublicSharedDeck shape — no
    // ownerId, no shareToken — so there's nothing to strip before
    // returning it.
    return NextResponse.json({ deck, resolvedCards: cardsById, validation, statistics });
  },
);
