import { NextRequest, NextResponse } from "next/server";
import { getOwnedDeck } from "@/lib/deck/repository";
import { getLatestReviewWithStaleness } from "@/lib/ai/review-service";
import { getOrCreateOwnerId } from "@/lib/owner";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const ownerId = await getOrCreateOwnerId();

    const deck = await getOwnedDeck(id, ownerId);
    if (!deck) {
      const error: ApiError = {
        error: { code: "DECK_NOT_FOUND", message: "No deck found with that id." },
      };
      return NextResponse.json(error, { status: 404 });
    }

    const outcome = await getLatestReviewWithStaleness(deck);
    return NextResponse.json({ review: outcome });
  },
);
