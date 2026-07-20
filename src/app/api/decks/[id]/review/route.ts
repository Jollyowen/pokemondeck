import { NextRequest, NextResponse } from "next/server";
import { getOwnedDeck } from "@/lib/deck/repository";
import { getOrGenerateReview } from "@/lib/ai/review-service";
import { AiProviderError, AiReviewOutputError, ReviewRateLimitError } from "@/lib/ai/errors";
import { getOrCreateOwnerId } from "@/lib/owner";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

export const POST = withApiErrorHandling(
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

    try {
      const outcome = await getOrGenerateReview(deck, ownerId);
      return NextResponse.json(outcome);
    } catch (error) {
      if (error instanceof ReviewRateLimitError) {
        const body: ApiError = { error: { code: "REVIEW_RATE_LIMITED", message: error.message } };
        return NextResponse.json(body, { status: 429 });
      }
      if (error instanceof AiReviewOutputError || error instanceof AiProviderError) {
        const body: ApiError = { error: { code: "AI_REVIEW_UNAVAILABLE", message: error.message } };
        return NextResponse.json(body, { status: 502 });
      }
      throw error;
    }
  },
);
