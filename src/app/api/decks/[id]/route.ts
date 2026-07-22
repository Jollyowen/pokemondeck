import { NextRequest, NextResponse } from "next/server";
import { updateDeckSchema } from "@/schemas/deck";
import { getOwnedDeck, updateOwnedDeck, softDeleteOwnedDeck } from "@/lib/deck/repository";
import { validateAndPersistStatus } from "@/lib/deck/service";
import { getOrCreateOwnerId } from "@/lib/owner";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

function notFound(): NextResponse {
  const error: ApiError = {
    error: { code: "DECK_NOT_FOUND", message: "No deck found with that id." },
  };
  return NextResponse.json(error, { status: 404 });
}

export const GET = withApiErrorHandling(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const ownerId = await getOrCreateOwnerId();

    const deck = await getOwnedDeck(id, ownerId);
    if (!deck) return notFound();

    const result = await validateAndPersistStatus(deck, ownerId);
    return NextResponse.json(result);
  },
);

export const PATCH = withApiErrorHandling(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const ownerId = await getOrCreateOwnerId();

    const body = await request.json().catch(() => null);
    const parsed = updateDeckSchema.safeParse(body);
    if (!parsed.success) {
      const error: ApiError = {
        error: {
          code: "INVALID_BODY",
          message: "One or more fields in the update were invalid.",
          details: parsed.error.flatten(),
        },
      };
      return NextResponse.json(error, { status: 400 });
    }

    const updated = await updateOwnedDeck(id, ownerId, {
      name: parsed.data.name,
      format: parsed.data.format,
      cards: parsed.data.cards,
      strategyArchetype: parsed.data.strategyArchetype,
      strategyNotes: parsed.data.strategyNotes,
      mainPokemonCardId: parsed.data.mainPokemonCardId,
    });
    if (!updated) return notFound();

    const result = await validateAndPersistStatus(updated, ownerId);
    return NextResponse.json(result);
  },
);

export const DELETE = withApiErrorHandling(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const ownerId = await getOrCreateOwnerId();

    const deleted = await softDeleteOwnedDeck(id, ownerId);
    if (!deleted) return notFound();

    return NextResponse.json({ deleted: true });
  },
);
