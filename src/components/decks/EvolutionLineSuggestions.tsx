"use client";

import { useEffect, useState } from "react";
import { isApiError } from "@/types/api";
import type { Card } from "@/types/card";
import { getEvolutionLineNames } from "@/lib/deck/evolution-line";

async function findCardsByExactName(name: string): Promise<Card[]> {
  const params = new URLSearchParams({ name, supertype: "Pokémon", pageSize: "20" });
  const res = await fetch(`/api/cards?${params.toString()}`);
  const body = await res.json();
  if (isApiError(body)) return [];
  const result = body as { cards: Card[] };
  // The search is a prefix/phrase match, not exact — filter down so we only
  // ever suggest the actual evolution, not anything that merely starts
  // with or contains the same words.
  return result.cards.filter((c) => c.name.toLowerCase() === name.toLowerCase());
}

export function EvolutionLineSuggestions({
  card,
  deckCardIds,
  onAdd,
}: {
  card: Card;
  deckCardIds: Set<string>;
  onAdd: (card: Card) => void;
}) {
  const names = getEvolutionLineNames(card);
  const [status, setStatus] = useState<"loading" | "idle" | "error">("loading");
  const [suggestions, setSuggestions] = useState<Card[]>([]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    Promise.all(names.map(findCardsByExactName))
      .then((results) => {
        if (cancelled) return;
        setSuggestions(results.flat());
        setStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names.join("|")]);

  if (status === "loading") {
    return <p className="text-xs text-ink-muted px-2 py-1">Looking up evolution line…</p>;
  }
  if (status === "error") {
    return <p className="text-xs text-danger-text px-2 py-1">Couldn&apos;t look up the evolution line.</p>;
  }
  if (suggestions.length === 0) {
    return <p className="text-xs text-ink-muted px-2 py-1">No other printings found in the catalogue.</p>;
  }

  return (
    <ul className="space-y-1 pl-2 border-l-2 border-line ml-2">
      {suggestions.map((suggestion) => {
        const alreadyInDeck = deckCardIds.has(suggestion.id);
        return (
          <li key={suggestion.id} className="flex items-center gap-2 text-xs py-0.5">
            <span className="flex-1 truncate">
              {suggestion.name} <span className="text-ink-muted">· {suggestion.setName}</span>
            </span>
            <button
              type="button"
              disabled={alreadyInDeck}
              onClick={() => onAdd(suggestion)}
              className="min-h-11 sm:min-h-0 sm:h-7 px-2 rounded-md border border-line-strong text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {alreadyInDeck ? "In deck" : "Add"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
