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
