import { NextRequest, NextResponse } from "next/server";
import { copySharedDeckToOwner } from "@/lib/deck/repository";
import { getOrCreateOwnerId } from "@/lib/owner";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

export const POST = withApiErrorHandling(
  async (_request: NextRequest, { params }: { params: Promise<{ token: string }> }) => {
    const { token } = await params;
    const ownerId = await getOrCreateOwnerId();

    const copy = await copySharedDeckToOwner(token, ownerId);
    if (!copy) {
      const error: ApiError = {
        error: {
          code: "SHARED_DECK_NOT_FOUND",
          message: "This share link is no longer valid.",
        },
      };
      return NextResponse.json(error, { status: 404 });
    }

    return NextResponse.json({ deck: copy }, { status: 201 });
  },
);
