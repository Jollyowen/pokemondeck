import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const OWNER_COOKIE = "owner_id";
const OWNER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2; // 2 years

/**
 * Reads the anonymous owner cookie, creating one if it doesn't exist yet.
 * This only establishes the browser-scoped identity; the matching `owners`
 * database row is created lazily, the first time a deck is actually saved
 * (see src/lib/deck/repository.ts), not here.
 */
export async function getOrCreateOwnerId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(OWNER_COOKIE)?.value;
  if (existing) return existing;

  const id = randomUUID();
  cookieStore.set(OWNER_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: OWNER_COOKIE_MAX_AGE_SECONDS,
  });
  return id;
}
