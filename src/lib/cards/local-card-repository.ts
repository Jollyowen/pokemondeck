import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { cardToRow, rowToCard, setToRow, rowToSet, type CardRow, type SetRow } from "@/lib/cards/card-row-mapping";
import type { Card, CardSearchInput, CardSearchResult, CardSet } from "@/types/card";

export async function searchLocalCards(input: CardSearchInput): Promise<CardSearchResult> {
  const supabase = getSupabaseServerClient();
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 24;

  let query = supabase.from("cards").select("*", { count: "exact" });

  if (input.name?.trim()) {
    // The trigram index on `name` is what makes this fast even with
    // wildcards on both sides — genuine substring matching, not just the
    // provider's prefix-ish search.
    query = query.ilike("name", `%${input.name.trim()}%`);
  }
  if (input.supertype) query = query.eq("supertype", input.supertype);
  if (input.pokemonType?.trim()) {
    const type = input.pokemonType.trim();
    if (input.supertype === "Energy") {
      // Many Basic/Special Energy cards have an EMPTY `types` array in
      // the underlying card data — confirmed from a real search result:
      // a "Basic Water Energy" printing (sve-3) with types: [], even
      // though the card is unambiguously Water-type by name. Strict
      // array-containment alone silently excludes cards like this,
      // which is why filtering Energy + a specific type was returning
      // far fewer results than a plain name search for the same word.
      // For Energy cards specifically, broaden the match to ALSO catch
      // cards whose name contains the type word — how every basic/
      // special energy card is actually named — rather than relying
      // solely on a `types` field that isn't reliably populated for
      // this supertype.
      query = query.or(`types.cs.{${type}},name.ilike.%${type}%`);
    } else {
      query = query.contains("types", [type]);
    }
  }
  if (input.setId?.trim()) query = query.eq("set_id", input.setId.trim());
  if (input.rarity?.trim()) query = query.eq("rarity", input.rarity.trim());

  query = query
    .order("set_release_date", { ascending: false })
    .order("id", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count } = await query;
  const rows = (data as CardRow[] | null) ?? [];

  return {
    cards: rows.map(rowToCard),
    page,
    pageSize,
    totalCount: count ?? 0,
  };
}

export async function getLocalCard(id: string): Promise<Card | null> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("cards").select("*").eq("id", id).maybeSingle<CardRow>();
  return data ? rowToCard(data) : null;
}

export async function getLocalCards(ids: string[]): Promise<Card[]> {
  if (ids.length === 0) return [];
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("cards").select("*").in("id", ids);
  return ((data as CardRow[] | null) ?? []).map(rowToCard);
}

export async function getLocalSets(): Promise<CardSet[]> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from("sets").select("*").order("release_date", { ascending: false });
  return ((data as SetRow[] | null) ?? []).map(rowToSet);
}

async function getSetReleaseDate(setId: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("sets")
    .select("release_date")
    .eq("id", setId)
    .maybeSingle<{ release_date: string }>();
  // Genuinely unknown only if the set itself hasn't been synced yet
  // either (rare — only matters for display ordering, never correctness).
  return data?.release_date ?? "0000/00/00";
}

/**
 * Writes a single card into the local database — used both by the sync
 * script (which already knows the set's release date) and by the
 * live-API fallback path (a card not yet locally synced), which looks
 * the set's release date up first.
 */
export async function upsertCard(card: Card, knownSetReleaseDate?: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const releaseDate = knownSetReleaseDate ?? (await getSetReleaseDate(card.setId));
  await supabase.from("cards").upsert(cardToRow(card, releaseDate), { onConflict: "id" });
}

/** Bulk upsert used by the sync script. Assumes every card's set has already been upserted via upsertSets. */
export async function upsertCards(cards: Card[], setReleaseDatesById: Record<string, string>): Promise<void> {
  if (cards.length === 0) return;
  const supabase = getSupabaseServerClient();
  const rows = cards.map((c) => cardToRow(c, setReleaseDatesById[c.setId] ?? "0000/00/00"));
  await supabase.from("cards").upsert(rows, { onConflict: "id" });
}

export async function upsertSets(sets: CardSet[]): Promise<void> {
  if (sets.length === 0) return;
  const supabase = getSupabaseServerClient();
  await supabase.from("sets").upsert(sets.map(setToRow), { onConflict: "id" });
}
