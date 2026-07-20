import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Deck, DeckCardEntry, DeckStatus } from "@/types/deck";
import type { DeckFormat } from "@/types/card";

type DeckRow = {
  id: string;
  owner_id: string;
  name: string;
  format: DeckFormat;
  status: DeckStatus;
  share_enabled: boolean;
  share_token: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type DeckCardRow = {
  card_id: string;
  card_name: string;
  quantity: number;
};

function toDeck(row: DeckRow, cards: DeckCardEntry[]): Deck {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    format: row.format,
    status: row.status,
    shareEnabled: row.share_enabled,
    shareToken: row.share_token,
    cards,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Ensures the `owners` row exists. Called lazily, only when a deck is actually saved. */
async function ensureOwnerRecord(ownerId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  await supabase.from("owners").upsert({ id: ownerId }, { onConflict: "id", ignoreDuplicates: true });
}

export async function createDeck(
  ownerId: string,
  name: string,
  format: DeckFormat,
): Promise<Deck> {
  await ensureOwnerRecord(ownerId);

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("decks")
    .insert({ owner_id: ownerId, name, format, status: "draft" })
    .select()
    .single<DeckRow>();

  if (error || !data) {
    throw new Error(`Failed to create deck: ${error?.message ?? "unknown error"}`);
  }

  return toDeck(data, []);
}

/** Returns null if the deck doesn't exist, is soft-deleted, or isn't owned by ownerId. */
export async function getOwnedDeck(deckId: string, ownerId: string): Promise<Deck | null> {
  const supabase = getSupabaseServerClient();

  const { data: deckRow } = await supabase
    .from("decks")
    .select()
    .eq("id", deckId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .maybeSingle<DeckRow>();

  if (!deckRow) return null;

  const { data: cardRows } = await supabase
    .from("deck_cards")
    .select("card_id, card_name, quantity")
    .eq("deck_id", deckId);

  const cards: DeckCardEntry[] = ((cardRows as DeckCardRow[] | null) ?? []).map((row) => ({
    cardId: row.card_id,
    cardName: row.card_name,
    quantity: row.quantity,
  }));

  return toDeck(deckRow, cards);
}

export type DeckUpdatePatch = {
  name?: string;
  format?: DeckFormat;
  cards?: DeckCardEntry[];
  status?: DeckStatus;
};

/** Returns null if the deck doesn't exist or isn't owned by ownerId. */
export async function updateOwnedDeck(
  deckId: string,
  ownerId: string,
  patch: DeckUpdatePatch,
): Promise<Deck | null> {
  const supabase = getSupabaseServerClient();

  // Ownership check up front so we never write to a deck we don't own.
  const { data: existing } = await supabase
    .from("decks")
    .select("id")
    .eq("id", deckId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  if (!existing) return null;

  const deckPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) deckPatch.name = patch.name;
  if (patch.format !== undefined) deckPatch.format = patch.format;
  if (patch.status !== undefined) deckPatch.status = patch.status;

  await supabase.from("decks").update(deckPatch).eq("id", deckId);

  if (patch.cards !== undefined) {
    // Replace strategy: simplest way to keep deck_cards in sync with a
    // client-supplied full card list, at MVP scale.
    await supabase.from("deck_cards").delete().eq("deck_id", deckId);
    if (patch.cards.length > 0) {
      await supabase.from("deck_cards").insert(
        patch.cards.map((c) => ({
          deck_id: deckId,
          card_id: c.cardId,
          card_name: c.cardName,
          quantity: c.quantity,
        })),
      );
    }
  }

  return getOwnedDeck(deckId, ownerId);
}

export type DeckSortBy = "updated_at" | "name" | "format";

export type DeckListItem = {
  id: string;
  name: string;
  format: DeckFormat;
  status: DeckStatus;
  cardCount: number;
  updatedAt: string;
};

export async function listOwnedDecks(ownerId: string, sortBy: DeckSortBy): Promise<DeckListItem[]> {
  const supabase = getSupabaseServerClient();
  const column = sortBy === "updated_at" ? "updated_at" : sortBy;
  const ascending = sortBy !== "updated_at"; // most-recently-updated first by default; name/format alphabetical

  const { data: deckRows } = await supabase
    .from("decks")
    .select("id, name, format, status, updated_at")
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .order(column, { ascending });

  const decks =
    (deckRows as Array<{
      id: string;
      name: string;
      format: DeckFormat;
      status: DeckStatus;
      updated_at: string;
    }> | null) ?? [];
  if (decks.length === 0) return [];

  const ids = decks.map((d) => d.id);
  const { data: cardRows } = await supabase
    .from("deck_cards")
    .select("deck_id, quantity")
    .in("deck_id", ids);

  const counts = new Map<string, number>();
  for (const row of (cardRows as Array<{ deck_id: string; quantity: number }> | null) ?? []) {
    counts.set(row.deck_id, (counts.get(row.deck_id) ?? 0) + row.quantity);
  }

  return decks.map((d) => ({
    id: d.id,
    name: d.name,
    format: d.format,
    status: d.status,
    cardCount: counts.get(d.id) ?? 0,
    updatedAt: d.updated_at,
  }));
}

export async function hasAnyOwnedDecks(ownerId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { count } = await supabase
    .from("decks")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .is("deleted_at", null);
  return (count ?? 0) > 0;
}

/** Soft-deletes a deck. Returns false if it didn't exist or wasn't owned by ownerId. */
export async function softDeleteOwnedDeck(deckId: string, ownerId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("decks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", deckId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();
  return Boolean(data);
}

/** Reverses a soft delete (used for the post-delete "Undo" action). */
export async function restoreOwnedDeck(deckId: string, ownerId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("decks")
    .update({ deleted_at: null })
    .eq("id", deckId)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle<{ id: string }>();
  return Boolean(data);
}

/**
 * Duplicates a deck's name, format and cards into a brand new deck.
 * Deliberately never touches deck_reviews — duplicates must not inherit
 * the original's AI reviews.
 */
export async function duplicateOwnedDeck(
  deckId: string,
  ownerId: string,
  requestedName?: string,
): Promise<Deck | null> {
  const original = await getOwnedDeck(deckId, ownerId);
  if (!original) return null;

  const name = requestedName?.trim() || `${original.name} (copy)`;
  const created = await createDeck(ownerId, name, original.format);

  if (original.cards.length === 0) return created;

  const updated = await updateOwnedDeck(created.id, ownerId, {
    cards: original.cards,
    status: original.status,
  });
  return updated ?? created;
}
