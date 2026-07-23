"use client";

import { useState } from "react";
import type { Card, DeckFormat } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";
import { isCardLegalInFormat } from "@/lib/format-legality";
import { getEvolutionLineNames } from "@/lib/deck/evolution-line";
import { formatCardPrice } from "@/lib/format-price";
import { EnergyTypeStack } from "@/components/cards/EnergyTypeIcon";
import { EvolutionLineSuggestions } from "@/components/decks/EvolutionLineSuggestions";
import {
  groupPokemonByEvolutionLine,
  groupTrainersByCategory,
  type EvolutionGroupNode,
} from "@/lib/deck/deck-card-grouping";

type SharedRowProps = {
  cardsById: Record<string, Card>;
  format: DeckFormat;
  onChangeQuantity: (cardId: string, quantity: number) => void;
  onRemoveAll: (cardId: string) => void;
  onAddCard: (card: Card) => void;
  onPreviewCard: (card: Card) => void;
  expandedCardId: string | null;
  setExpandedCardId: (id: string | null) => void;
  deckCardIds: Set<string>;
};

/** A single deck-card row — the add/remove controls, image, and evolution-line disclosure for one entry. */
function DeckCardRow({ entry, ...props }: { entry: DeckCardEntry } & SharedRowProps) {
  const { cardsById, format, onChangeQuantity, onRemoveAll, onAddCard, onPreviewCard, expandedCardId, setExpandedCardId, deckCardIds } = props;
  const card = cardsById[entry.cardId];
  const legal = card ? isCardLegalInFormat(card, format) : true;
  const evolutionNames = card ? getEvolutionLineNames(card) : [];
  const isExpanded = expandedCardId === entry.cardId;
  const price = card ? formatCardPrice(card.price) : null;

  return (
    <li>
      <div
        className={`flex items-center gap-2 rounded-md border border-neutral-200 p-1.5 ${legal ? "" : "bg-amber-50"}`}
      >
        {card?.imageSmall ? (
          <button
            type="button"
            onClick={() => onPreviewCard(card)}
            aria-label={`View larger image of ${entry.cardName}`}
            className="shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-neutral-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- external, dynamic provider image */}
            <img src={card.imageSmall} alt="" className="w-10 rounded-sm" />
          </button>
        ) : (
          <div className="w-10 aspect-[63/88] shrink-0 rounded-sm bg-neutral-100" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">{entry.cardName}</p>
          {card && (
            <>
              <p className="text-xs text-neutral-500 truncate">{card.setName}</p>
              {/*
                Set, energy type, and rarity used to share one truncated
                text line — at deeper evolution-line indentation levels
                the available width shrinks (see the depth-based
                marginLeft in EvolutionGroupList below), so most of that
                line got cut off entirely. Wrapping these as separate
                chips lets them stack onto a second line instead of
                disappearing. Price is included here too rather than
                tacked onto the end of the old line, for the same reason.
              */}
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                {card.types.length > 0 && <EnergyTypeStack types={card.types} size={14} />}
                {card.rarity && (
                  <span className="whitespace-nowrap rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                    {card.rarity}
                  </span>
                )}
                {price && (
                  <span className="whitespace-nowrap rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                    {price}
                  </span>
                )}
              </div>
            </>
          )}
          {!legal && <span className="text-xs text-amber-700 whitespace-nowrap">Not legal in this format</span>}
        </div>

        <div className="flex items-center gap-1 shrink-0">
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
}

/** Recursively renders an evolution-line node: its own printings, then each child indented underneath. */
function EvolutionGroupList({ node, depth, ...props }: { node: EvolutionGroupNode; depth: number } & SharedRowProps) {
  return (
    <>
      {node.entries.map((entry) => (
        <div
          key={entry.cardId}
          className={depth > 0 ? "border-l-2 border-neutral-200 pl-2" : undefined}
          style={depth > 0 ? { marginLeft: depth * 16 } : undefined}
        >
          <DeckCardRow entry={entry} {...props} />
        </div>
      ))}
      {node.children.map((child) => (
        <EvolutionGroupList key={child.name} node={child} depth={depth + 1} {...props} />
      ))}
    </>
  );
}

export function DeckCardList({
  entries,
  cardsById,
  format,
  onChangeQuantity,
  onRemoveAll,
  onAddCard,
  onPreviewCard,
}: {
  entries: DeckCardEntry[];
  cardsById: Record<string, Card>;
  format: DeckFormat;
  onChangeQuantity: (cardId: string, quantity: number) => void;
  onRemoveAll: (cardId: string) => void;
  onAddCard: (card: Card) => void;
  onPreviewCard: (card: Card) => void;
}) {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="py-10 text-center text-neutral-500 text-sm">
        No cards yet — search on the left and add some.
      </div>
    );
  }

  const deckCardIds = new Set(entries.map((e) => e.cardId));
  const rowProps: SharedRowProps = {
    cardsById,
    format,
    onChangeQuantity,
    onRemoveAll,
    onAddCard,
    onPreviewCard,
    expandedCardId,
    setExpandedCardId,
    deckCardIds,
  };

  const pokemonTree = groupPokemonByEvolutionLine(entries, cardsById);
  const pokemonCount = entries
    .filter((e) => cardsById[e.cardId]?.supertype === "Pokémon")
    .reduce((s, e) => s + e.quantity, 0);

  const trainerGroups = groupTrainersByCategory(entries, cardsById);
  const trainerCount = entries
    .filter((e) => cardsById[e.cardId]?.supertype === "Trainer")
    .reduce((s, e) => s + e.quantity, 0);

  const energyEntries = entries
    .filter((e) => cardsById[e.cardId]?.supertype === "Energy")
    .sort((a, b) => a.cardName.localeCompare(b.cardName));
  const energyCount = energyEntries.reduce((s, e) => s + e.quantity, 0);

  const unresolved = entries.filter((e) => !cardsById[e.cardId]);

  return (
    <div className="space-y-6">
      {pokemonTree.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-neutral-500 mb-2">Pokémon ({pokemonCount})</h3>
          <ul className="space-y-1">
            {pokemonTree.map((root) => (
              <EvolutionGroupList key={root.name} node={root} depth={0} {...rowProps} />
            ))}
          </ul>
        </section>
      )}

      {trainerGroups.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-neutral-500 mb-2">Trainer ({trainerCount})</h3>
          <div className="space-y-3">
            {trainerGroups.map((group) => (
              <div key={group.category}>
                <h4 className="text-xs font-medium text-neutral-400 mb-1">
                  {group.category} ({group.entries.reduce((s, e) => s + e.quantity, 0)})
                </h4>
                <ul className="space-y-1">
                  {group.entries.map((entry) => (
                    <DeckCardRow key={entry.cardId} entry={entry} {...rowProps} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {energyEntries.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-neutral-500 mb-2">Energy ({energyCount})</h3>
          <ul className="space-y-1">
            {energyEntries.map((entry) => (
              <DeckCardRow key={entry.cardId} entry={entry} {...rowProps} />
            ))}
          </ul>
        </section>
      )}

      {unresolved.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-amber-700 mb-2">Unresolved ({unresolved.length})</h3>
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
