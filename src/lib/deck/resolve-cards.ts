import "server-only";
import type { Card } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";
import { getLocalCards, upsertCard } from "@/lib/cards/local-card-repository";
import { tcgdexApiProvider, TcgdexApiError } from "@/lib/providers/tcgdex-api";

export async function resolveDeckCards(
  entries: DeckCardEntry[],
): Promise<{ cardsById: Record<string, Card>; missingCardIds: string[] }> {
  const ids = [...new Set(entries.map((e) => e.cardId))];
  if (ids.length === 0) return { cardsById: {}, missingCardIds: [] };

  const local = await getLocalCards(ids);
  const localIds = new Set(local.map((c) => c.id));
  const missingLocally = ids.filter((id) => !localIds.has(id));

  let fetched: Card[] = [];
  if (missingLocally.length > 0) {
    try {
      fetched = await tcgdexApiProvider.getCards(missingLocally);
      // Write back so these become local cache hits from here on, rather
      // than depending on a live fetch succeeding again on every future load.
      await Promise.all(fetched.map((c) => upsertCard(c)));
    } catch (error) {
      if (!(error instanceof TcgdexApiError)) throw error;
      // Provider unavailable and not in the local mirror: those ids stay
      // missing, reported to the caller as CARD_NOT_FOUND rather than
      // failing the whole request, so the deck itself remains viewable/editable.
    }
  }

  const all = [...local, ...fetched];
  const cardsById = Object.fromEntries(all.map((c) => [c.id, c]));
  const missingCardIds = ids.filter((id) => !cardsById[id]);

  if (missingCardIds.length > 0) {
    console.log("resolveDeckCards: some card IDs could not be resolved", {
      requestedCount: ids.length,
      missingCount: missingCardIds.length,
      missingCardIds,
    });
  }

  return { cardsById, missingCardIds };
}
