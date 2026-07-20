import { NextRequest, NextResponse } from "next/server";
import { restoreOwnedDeck } from "@/lib/deck/repository";
import { getOrCreateOwnerId } from "@/lib/owner";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

export const POST = withApiErrorHandling(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const ownerId = await getOrCreateOwnerId();

    const restored = await restoreOwnedDeck(id, ownerId);
    if (!restored) {
      const error: ApiError = {
        error: { code: "DECK_NOT_FOUND", message: "No deck found with that id." },
      };
      return NextResponse.json(error, { status: 404 });
    }

    return NextResponse.json({ restored: true });
  },
);
