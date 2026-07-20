import { NextRequest, NextResponse } from "next/server";
import { createDeckSchema } from "@/schemas/deck";
import { createDeck, listOwnedDecks, type DeckSortBy } from "@/lib/deck/repository";
import { getOrCreateOwnerId } from "@/lib/owner";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

const VALID_SORTS: DeckSortBy[] = ["updated_at", "name", "format"];

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const ownerId = await getOrCreateOwnerId();
  const sortParam = request.nextUrl.searchParams.get("sort");
  const sort: DeckSortBy = VALID_SORTS.includes(sortParam as DeckSortBy)
    ? (sortParam as DeckSortBy)
    : "updated_at";

  const decks = await listOwnedDecks(ownerId, sort);
  return NextResponse.json({ decks });
});

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const parsed = createDeckSchema.safeParse(body);

  if (!parsed.success) {
    const error: ApiError = {
      error: {
        code: "INVALID_BODY",
        message: "Deck name and format are required.",
        details: parsed.error.flatten(),
      },
    };
    return NextResponse.json(error, { status: 400 });
  }

  const ownerId = await getOrCreateOwnerId();
  const deck = await createDeck(ownerId, parsed.data.name, parsed.data.format);

  return NextResponse.json({ deck }, { status: 201 });
});
