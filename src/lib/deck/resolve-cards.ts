import "server-only";
import type { Card } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";
import { getCachedCards, setCachedCards } from "@/lib/cache/card-cache";
import { pokemonTcgApiProvider, PokemonTcgApiError } from "@/lib/providers/pokemon-tcg-api";

export async function resolveDeckCards(
  entries: DeckCardEntry[],
): Promise<{ cardsById: Record<string, Card>; missingCardIds: string[] }> {
  const ids = [...new Set(entries.map((e) => e.cardId))];
  if (ids.length === 0) return { cardsById: {}, missingCardIds: [] };

  const cached = await getCachedCards(ids);
  const cachedIds = new Set(cached.map((c) => c.id));
  const missingFromCache = ids.filter((id) => !cachedIds.has(id));

  let fetched: Card[] = [];
  if (missingFromCache.length > 0) {
    try {
      fetched = await pokemonTcgApiProvider.getCards(missingFromCache);
      await setCachedCards(fetched);
    } catch (error) {
      if (!(error instanceof PokemonTcgApiError)) throw error;
      // Provider unavailable and not in cache: those ids stay missing,
      // reported to the caller as CARD_NOT_FOUND rather than failing the
      // whole request, so the deck itself remains viewable/editable.
    }
  }

  const all = [...cached, ...fetched];
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
