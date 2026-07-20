import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Card, CardSet } from "@/types/card";

// Card data changes only when new sets release, so a generous TTL is safe.
const CARD_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SET_TTL_MS = 24 * 60 * 60 * 1000; // 1 day (release schedule can shift)

const PROVIDER = "pokemon_tcg_api";
const SET_PROVIDER = "pokemon_tcg_api:set";

type CacheRow = { card_id: string; payload: unknown; fetched_at: string };

function isFresh(fetchedAt: string, ttlMs: number): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < ttlMs;
}

export async function getCachedCard(cardId: string): Promise<{ card: Card; fresh: boolean } | null> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("card_cache")
    .select("card_id, payload, fetched_at")
    .eq("provider", PROVIDER)
    .eq("card_id", cardId)
    .maybeSingle<CacheRow>();

  if (!data) return null;
  return { card: data.payload as Card, fresh: isFresh(data.fetched_at, CARD_TTL_MS) };
}

export async function getCachedCards(cardIds: string[]): Promise<Card[]> {
  if (cardIds.length === 0) return [];
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("card_cache")
    .select("card_id, payload, fetched_at")
    .eq("provider", PROVIDER)
    .in("card_id", cardIds);

  return ((data as CacheRow[] | null) ?? []).map((row) => row.payload as Card);
}

export async function setCachedCards(cards: Card[]): Promise<void> {
  if (cards.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("card_cache").upsert(
    cards.map((card) => ({
      provider: PROVIDER,
      card_id: card.id,
      payload: card,
      fetched_at: new Date().toISOString(),
    })),
    { onConflict: "provider,card_id" },
  );
}

export async function getCachedSets(): Promise<{ sets: CardSet[]; fresh: boolean } | null> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("card_cache")
    .select("card_id, payload, fetched_at")
    .eq("provider", SET_PROVIDER);

  if (!data || data.length === 0) return null;
  const rows = data as CacheRow[];
  const sets = rows.map((row) => row.payload as CardSet);
  const fresh = rows.every((row) => isFresh(row.fetched_at, SET_TTL_MS));
  return { sets, fresh };
}

export async function setCachedSets(sets: CardSet[]): Promise<void> {
  if (sets.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("card_cache").upsert(
    sets.map((set) => ({
      provider: SET_PROVIDER,
      card_id: set.id,
      payload: set,
      fetched_at: new Date().toISOString(),
    })),
    { onConflict: "provider,card_id" },
  );
}

/**
 * Best-effort fallback for search when the upstream API is unavailable:
 * matches cached cards by a case-insensitive name substring. This cannot
 * reproduce the full provider query syntax, so it is only ever used as a
 * degraded fallback, never as the primary search path.
 */
export async function searchCachedCardsByName(name: string, limit: number): Promise<Card[]> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("card_cache")
    .select("payload")
    .eq("provider", PROVIDER)
    .ilike("payload->>name", `%${name}%`)
    .limit(limit);

  return ((data as Array<{ payload: unknown }> | null) ?? []).map((row) => row.payload as Card);
}
