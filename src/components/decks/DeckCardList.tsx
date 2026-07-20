"use client";

import { useState } from "react";
import type { Card, DeckFormat } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";
import { isCardLegalInFormat } from "@/lib/format-legality";
import { getEvolutionLineNames } from "@/lib/deck/evolution-line";
import { EvolutionLineSuggestions } from "@/components/decks/EvolutionLineSuggestions";

const GROUP_ORDER: Array<Card["supertype"]> = ["Pokémon", "Trainer", "Energy"];

export function DeckCardList({
  entries,
  cardsById,
  format,
  onChangeQuantity,
  onRemoveAll,
  onAddCard,
}: {
  entries: DeckCardEntry[];
  cardsById: Record<string, Card>;
  format: DeckFormat;
  onChangeQuantity: (cardId: string, quantity: number) => void;
  onRemoveAll: (cardId: string) => void;
  onAddCard: (card: Card) => void;
}) {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="py-10 text-center text-neutral-500 text-sm">
        No cards yet — search on the left and add some.
      </div>
    );
  }

  const groups = GROUP_ORDER.map((supertype) => ({
    supertype,
    entries: entries
      .filter((e) => cardsById[e.cardId]?.supertype === supertype)
      .sort((a, b) => a.cardName.localeCompare(b.cardName)),
  })).filter((g) => g.entries.length > 0);

  // Entries whose card data hasn't resolved yet (e.g. offline) still need to be shown.
  const unresolved = entries.filter((e) => !cardsById[e.cardId]);
  const deckCardIds = new Set(entries.map((e) => e.cardId));

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.supertype}>
          <h3 className="text-sm font-semibold text-neutral-500 mb-2">
            {group.supertype} ({group.entries.reduce((s, e) => s + e.quantity, 0)})
          </h3>
          <ul className="space-y-1">
            {group.entries.map((entry) => {
              const card = cardsById[entry.cardId];
              const legal = card ? isCardLegalInFormat(card, format) : true;
              const evolutionNames = card ? getEvolutionLineNames(card) : [];
              const isExpanded = expandedCardId === entry.cardId;
              return (
                <li key={entry.cardId}>
                  <div
                    className={`flex items-center gap-2 rounded-md border border-neutral-200 px-2 py-1.5 ${
                      legal ? "" : "bg-amber-50"
                    }`}
                  >
                    <span className="flex-1 text-sm truncate">{entry.cardName}</span>
                    {!legal && (
                      <span className="text-xs text-amber-700 whitespace-nowrap">Illegal</span>
                    )}
                    <div className="flex items-center gap-1">
                      {evolutionNames.length > 0 && (
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={`Show evolution line for ${entry.cardName}`}
                          className="min-h-11 px-2 rounded-md border border-neutral-300 text-xs text-neutral-600"
                          onClick={() => setExpandedCardId(isExpanded ? null : entry.cardId)}
                        >
                          Evolutions {isExpanded ? "▲" : "▼"}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Decrease ${entry.cardName} quantity`}
                        className="min-h-11 min-w-11 rounded-md border border-neutral-300 text-lg leading-none"
                        onClick={() => onChangeQuantity(entry.cardId, entry.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm tabular-nums">{entry.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Increase ${entry.cardName} quantity`}
                        className="min-h-11 min-w-11 rounded-md border border-neutral-300 text-lg leading-none"
                        onClick={() => onChangeQuantity(entry.cardId, entry.quantity + 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove all copies of ${entry.cardName}`}
                        className="min-h-11 px-2 rounded-md border border-neutral-300 text-xs text-neutral-500"
                        onClick={() => onRemoveAll(entry.cardId)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {isExpanded && card && (
                    <div className="mt-1 mb-2">
                      <EvolutionLineSuggestions card={card} deckCardIds={deckCardIds} onAdd={onAddCard} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {unresolved.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-amber-700 mb-2">
            Unresolved ({unresolved.length})
          </h3>
          <ul className="space-y-1">
            {unresolved.map((entry) => (
              <li
                key={entry.cardId}
                className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm"
              >
                <span>{entry.cardName} (not found in catalogue)</span>
                <button
                  type="button"
                  className="min-h-11 px-2 text-xs text-neutral-600"
                  onClick={() => onRemoveAll(entry.cardId)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
