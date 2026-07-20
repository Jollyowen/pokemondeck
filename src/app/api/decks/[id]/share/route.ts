import { NextRequest, NextResponse } from "next/server";
import { enableSharing, revokeSharing } from "@/lib/deck/repository";
import { getOrCreateOwnerId } from "@/lib/owner";
import { getServerEnv } from "@/lib/env";
import { withApiErrorHandling } from "@/lib/api/with-error-handling";
import type { ApiError } from "@/types/api";

function notFound(): NextResponse {
  const error: ApiError = {
    error: { code: "DECK_NOT_FOUND", message: "No deck found with that id." },
  };
  return NextResponse.json(error, { status: 404 });
}

export const POST = withApiErrorHandling(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const ownerId = await getOrCreateOwnerId();

    const result = await enableSharing(id, ownerId);
    if (!result) return notFound();

    const env = getServerEnv();
    const shareUrl = `${env.NEXT_PUBLIC_APP_URL}/shared/${result.shareToken}`;
    return NextResponse.json({ shareUrl, shareToken: result.shareToken });
  },
);

export const DELETE = withApiErrorHandling(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const ownerId = await getOrCreateOwnerId();

    const revoked = await revokeSharing(id, ownerId);
    if (!revoked) return notFound();

    return NextResponse.json({ revoked: true });
  },
);
