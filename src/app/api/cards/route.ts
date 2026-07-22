import { NextRequest, NextResponse } from "next/server";
import { cardSearchSchema } from "@/schemas/card-search";
import { searchLocalCards } from "@/lib/cards/local-card-repository";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";
import type { CardSearchResult } from "@/types/card";

export const GET = withApiErrorHandling(async (request: NextRequest) => {
  const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = cardSearchSchema.safeParse(rawParams);

  if (!parsed.success) {
    const body: ApiError = {
      error: {
        code: "INVALID_QUERY",
        message: "One or more search parameters were invalid.",
        details: parsed.error.flatten(),
      },
    };
    return NextResponse.json(body, { status: 400 });
  }

  // Reads the local database mirror — fast, no external rate limit, and
  // fuzzy/substring name matching via the trigram index, none of which
  // the live provider gives us directly. Kept current by a scheduled
  // sync job (scripts/sync-cards.ts). Right after this feature is first
  // deployed, the table will be empty until that job's first run —
  // expected, not a bug; see the README for how to trigger it manually.
  const result = await searchLocalCards(parsed.data);
  return NextResponse.json(result satisfies CardSearchResult);
});
