import { NextRequest, NextResponse } from "next/server";
import { generateDeckSchema } from "@/schemas/deck";
import { generateDeck, PokemonNotFoundError } from "@/lib/ai/generation-service";
import { AiProviderError, AiReviewOutputError, GenerationRateLimitError } from "@/lib/ai/errors";
import { getOrCreateOwnerId } from "@/lib/owner";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

export const POST = withApiErrorHandling(async (request: NextRequest) => {
  const ownerId = await getOrCreateOwnerId();

  const body = await request.json().catch(() => null);
  const parsed = generateDeckSchema.safeParse(body);
  if (!parsed.success) {
    const error: ApiError = {
      error: {
        code: "INVALID_BODY",
        message: "One or more fields were invalid.",
        details: parsed.error.flatten(),
      },
    };
    return NextResponse.json(error, { status: 400 });
  }

  try {
    const result = await generateDeck(
      {
        format: parsed.data.format,
        strategyArchetype: parsed.data.strategyArchetype ?? null,
        pokemonName: parsed.data.pokemonName,
        strategyNotes: parsed.data.strategyNotes ?? null,
      },
      ownerId,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof GenerationRateLimitError) {
      const body: ApiError = { error: { code: "GENERATION_RATE_LIMITED", message: error.message } };
      return NextResponse.json(body, { status: 429 });
    }
    if (error instanceof PokemonNotFoundError) {
      const body: ApiError = { error: { code: "POKEMON_NOT_FOUND", message: error.message } };
      return NextResponse.json(body, { status: 404 });
    }
    if (error instanceof AiReviewOutputError || error instanceof AiProviderError) {
      const body: ApiError = { error: { code: "AI_GENERATION_UNAVAILABLE", message: error.message } };
      return NextResponse.json(body, { status: 502 });
    }
    throw error;
  }
});
