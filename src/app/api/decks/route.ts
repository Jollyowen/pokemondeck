import { NextRequest, NextResponse } from "next/server";
import { createDeckSchema } from "@/schemas/deck";
import { createDeck } from "@/lib/deck/repository";
import { getOrCreateOwnerId } from "@/lib/owner";
import type { ApiError } from "@/types/api";

export async function POST(request: NextRequest) {
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
}
