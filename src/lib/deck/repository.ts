import "server-only";
import { randomBytes } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getLocalCards } from "@/lib/cards/local-card-repository";
import { computeEstimatedDeckValue, type EstimatedDeckValue } from "@/lib/deck/deck-value";
import { reportError } from "@/lib/monitoring/report-error";
import type { Deck, DeckCardEntry, DeckStatus, StrategyArchetype } from "@/types/deck";
import type { DeckFormat } from "@/types/card";

type DeckRow = {
  id: string;
  owner_id: string;
  name: string;
  format: DeckFormat;
  status: DeckStatus;
  share_enabled: boolean;
  share_token: string | null;
  strategy_archetype: StrategyArchetype | null;
  strategy_notes: string | null;
  main_pokemon_card_id: string | null;
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
    strategyArchetype: row.strategy_archetype,
    strategyNotes: row.strategy_notes,
    mainPokemonCardId: row.main_pokemon_card_id,
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
  strategyArchetype?: StrategyArchetype | null;
  strategyNotes?: string | null;
  mainPokemonCardId?: string | null;
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
  if (patch.strategyArchetype !== undefined) deckPatch.strategy_archetype = patch.strategyArchetype;
  if (patch.strategyNotes !== undefined) deckPatch.strategy_notes = patch.strategyNotes;
  if (patch.mainPokemonCardId !== undefined) deckPatch.main_pokemon_card_id = patch.mainPokemonCardId;

  await supabase.from("decks").update(deckPatch).eq("id", deckId).eq("owner_id", ownerId);

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
  mainPokemonCardId: string | null;
  /** Small card art URL for the deck's chosen main Pokémon, if it resolved. Null until the user sets one, or if that card no longer resolves. */
  mainPokemonImageSmall: string | null;
  /**
   * Elemental (energy) types present among the deck's Pokémon, ordered by
   * how many cards carry each type (most-represented first) — drives the
   * stacked type-icon order on the deck-library card. Not the same thing
   * as Basic Energy cards; a dual-type Pokémon counts toward both types,
   * same convention already used by the statistics engine.
   */
  energyTypes: string[];
  /**
   * Same computation as the deck editor's own stats panel
   * (computeEstimatedDeckValue), run here server-side since the library
   * view never loads full per-deck card data into the client the way
   * the editor does. Null when no card in the deck has price data at
   * all (not the same as $0 — that would be misleading).
   */
  estimatedValue: EstimatedDeckValue | null;
};

export async function listOwnedDecks(ownerId: string, sortBy: DeckSortBy): Promise<DeckListItem[]> {
  const supabase = getSupabaseServerClient();
  const column = sortBy === "updated_at" ? "updated_at" : sortBy;
  const ascending = sortBy !== "updated_at"; // most-recently-updated first by default; name/format alphabetical

  const { data: deckRows, error: deckRowsError } = await supabase
    .from("decks")
    .select("id, name, format, status, updated_at, main_pokemon_card_id")
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .order(column, { ascending });

  if (deckRowsError) {
    // A query error here (e.g. a column the code expects but a migration
    // that hasn't been applied yet) must never be swallowed into "no
    // decks" — that's indistinguishable from actual data loss to anyone
    // looking at the resulting empty list. Fail loudly instead.
    reportError("Failed to list owned decks", deckRowsError, { ownerId });
    throw new Error("Failed to load decks from the database.");
  }

  const decks =
    (deckRows as Array<{
      id: string;
      name: string;
      format: DeckFormat;
      status: DeckStatus;
      updated_at: string;
      main_pokemon_card_id: string | null;
    }> | null) ?? [];
  if (decks.length === 0) return [];

  const ids = decks.map((d) => d.id);
  const { data: cardRows } = await supabase
    .from("deck_cards")
    .select("deck_id, card_id, quantity")
    .in("deck_id", ids);

  const deckCardRows = (cardRows as Array<{ deck_id: string; card_id: string; quantity: number }> | null) ?? [];

  const counts = new Map<string, number>();
  const cardsByDeck = new Map<string, Array<{ cardId: string; quantity: number }>>();
  for (const row of deckCardRows) {
    counts.set(row.deck_id, (counts.get(row.deck_id) ?? 0) + row.quantity);
    const list = cardsByDeck.get(row.deck_id) ?? [];
    list.push({ cardId: row.card_id, quantity: row.quantity });
    cardsByDeck.set(row.deck_id, list);
  }

  // Batch-resolve every referenced card once (main-Pokémon picks plus every
  // deck card, for the energy-type stack) rather than a query per deck.
  const uniqueCardIds = Array.from(
    new Set([...deckCardRows.map((r) => r.card_id), ...decks.map((d) => d.main_pokemon_card_id).filter((id): id is string => Boolean(id))]),
  );
  const resolvedCards = await getLocalCards(uniqueCardIds);
  const cardById = new Map(resolvedCards.map((c) => [c.id, c]));

  return decks.map((d) => {
    const deckCards = cardsByDeck.get(d.id) ?? [];
    const typeCounts = new Map<string, number>();
    for (const entry of deckCards) {
      const card = cardById.get(entry.cardId);
      if (!card || card.supertype !== "Pokémon") continue;
      for (const type of card.types) {
        typeCounts.set(type, (typeCounts.get(type) ?? 0) + entry.quantity);
      }
    }
    const energyTypes = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type]) => type);

    const mainCard = d.main_pokemon_card_id ? cardById.get(d.main_pokemon_card_id) : undefined;

    // Reuses the exact same pure function the deck editor's stats panel
    // uses — DeckCardEntry only needs cardId/quantity for this
    // computation, and cardById is already resolved above for the
    // energy-type stack, so no extra query is needed here.
    const estimatedValue = computeEstimatedDeckValue(
      deckCards.map((c) => ({ cardId: c.cardId, quantity: c.quantity, cardName: "" })),
      Object.fromEntries(cardById),
    );

    return {
      id: d.id,
      name: d.name,
      format: d.format,
      status: d.status,
      cardCount: counts.get(d.id) ?? 0,
      updatedAt: d.updated_at,
      mainPokemonCardId: d.main_pokemon_card_id,
      mainPokemonImageSmall: mainCard?.imageSmall ?? null,
      energyTypes,
      estimatedValue,
    };
  });
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
    strategyArchetype: original.strategyArchetype,
    strategyNotes: original.strategyNotes,
    mainPokemonCardId: original.mainPokemonCardId,
  });
  return updated ?? created;
}

/** 128 bits of entropy, hex-encoded — never derived from or equal to the deck's own database id. */
export function generateShareToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Enables sharing, always issuing a brand new token. This means a previous
 * share link can never accidentally start working again just because
 * sharing was re-enabled later — see revokeSharing, which clears the
 * token entirely on disable.
 */
export async function enableSharing(deckId: string, ownerId: string): Promise<{ shareToken: string } | null> {
  const supabase = getSupabaseServerClient();
  const shareToken = generateShareToken();

  const { data } = await supabase
    .from("decks")
    .update({ share_enabled: true, share_token: shareToken, updated_at: new Date().toISOString() })
    .eq("id", deckId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  return data ? { shareToken } : null;
}

/** Revokes sharing and clears the token, so the old link can never work again even if re-shared later. */
export async function revokeSharing(deckId: string, ownerId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("decks")
    .update({ share_enabled: false, share_token: null, updated_at: new Date().toISOString() })
    .eq("id", deckId)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle<{ id: string }>();
  return Boolean(data);
}

export type PublicSharedDeck = {
  id: string;
  name: string;
  format: DeckFormat;
  status: DeckStatus;
  cards: DeckCardEntry[];
  strategyArchetype: StrategyArchetype | null;
  strategyNotes: string | null;
  mainPokemonCardId: string | null;
  updatedAt: string;
};

/**
 * Looks up a deck by its public share token. Deliberately returns a
 * narrower shape than the internal Deck type — no ownerId, no shareToken
 * itself, no deletedAt — so there's no risk of an owner-identifying field
 * leaking into a public JSON response by accident.
 */
export async function getSharedDeckByToken(shareToken: string): Promise<PublicSharedDeck | null> {
  const supabase = getSupabaseServerClient();

  const { data: deckRow, error: deckRowError } = await supabase
    .from("decks")
    .select("id, name, format, status, strategy_archetype, strategy_notes, main_pokemon_card_id, updated_at")
    .eq("share_token", shareToken)
    .eq("share_enabled", true)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      name: string;
      format: DeckFormat;
      status: DeckStatus;
      strategy_archetype: StrategyArchetype | null;
      strategy_notes: string | null;
      main_pokemon_card_id: string | null;
      updated_at: string;
    }>();

  if (deckRowError) {
    // Logged for diagnosability, but deliberately still falls through to
    // the same "not found" response as a genuinely missing/revoked token
    // — a public endpoint shouldn't distinguish "doesn't exist" from
    // "the query itself failed" in its response, only in the server log.
    reportError("Failed to look up shared deck by token", deckRowError);
  }

  if (!deckRow) return null;

  const { data: cardRows } = await supabase
    .from("deck_cards")
    .select("card_id, card_name, quantity")
    .eq("deck_id", deckRow.id);

  const cards: DeckCardEntry[] = ((cardRows as DeckCardRow[] | null) ?? []).map((row) => ({
    cardId: row.card_id,
    cardName: row.card_name,
    quantity: row.quantity,
  }));

  return {
    id: deckRow.id,
    name: deckRow.name,
    format: deckRow.format,
    status: deckRow.status,
    cards,
    strategyArchetype: deckRow.strategy_archetype,
    strategyNotes: deckRow.strategy_notes,
    mainPokemonCardId: deckRow.main_pokemon_card_id,
    updatedAt: deckRow.updated_at,
  };
}

/**
 * Copies a publicly shared deck into a new owner's library. Looked up by
 * share token (not deck id) so this only ever works for decks that are
 * actually currently shared — an unshared or revoked deck can't be copied
 * this way even if someone somehow knew its database id.
 */
export async function copySharedDeckToOwner(
  shareToken: string,
  newOwnerId: string,
): Promise<Deck | null> {
  const shared = await getSharedDeckByToken(shareToken);
  if (!shared) return null;

  const created = await createDeck(newOwnerId, shared.name, shared.format);
  if (shared.cards.length === 0) return created;

  const updated = await updateOwnedDeck(created.id, newOwnerId, {
    cards: shared.cards,
    status: shared.status,
    strategyArchetype: shared.strategyArchetype,
    strategyNotes: shared.strategyNotes,
    mainPokemonCardId: shared.mainPokemonCardId,
  });
  return updated ?? created;
}
