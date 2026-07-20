import { NextRequest, NextResponse } from "next/server";
import { duplicateDeckSchema } from "@/schemas/deck";
import { duplicateOwnedDeck } from "@/lib/deck/repository";
import { getOrCreateOwnerId } from "@/lib/owner";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

export const POST = withApiErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const ownerId = await getOrCreateOwnerId();

    const body = await request.json().catch(() => ({}));
    const parsed = duplicateDeckSchema.safeParse(body ?? {});
    if (!parsed.success) {
      const error: ApiError = {
        error: {
          code: "INVALID_BODY",
          message: "Invalid duplicate request.",
          details: parsed.error.flatten(),
        },
      };
      return NextResponse.json(error, { status: 400 });
    }

    const duplicate = await duplicateOwnedDeck(id, ownerId, parsed.data.name);
    if (!duplicate) {
      const error: ApiError = {
        error: { code: "DECK_NOT_FOUND", message: "No deck found with that id." },
      };
      return NextResponse.json(error, { status: 404 });
    }

    return NextResponse.json({ deck: duplicate }, { status: 201 });
  },
);
