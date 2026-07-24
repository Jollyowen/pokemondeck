"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { isApiError } from "@/types/api";
import type { Card } from "@/types/card";
import type { Deck, DeckCardEntry } from "@/types/deck";
import {
  groupPokemonByEvolutionLine,
  groupTrainersByCategory,
  type EvolutionGroupNode,
} from "@/lib/deck/deck-card-grouping";
import { EnergyTypeStack } from "@/components/cards/EnergyTypeIcon";
import { resolveDisplayTypes } from "@/lib/deck/validate";

/** Walks an evolution-line tree depth-first (Basic first, then its evolutions), same visual order as the deck editor. */
function flattenEvolutionTree(nodes: EvolutionGroupNode[]): DeckCardEntry[] {
  const out: DeckCardEntry[] = [];
  function visit(node: EvolutionGroupNode) {
    out.push(...node.entries);
    for (const child of node.children) visit(child);
  }
  for (const node of nodes) visit(node);
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const CARDS_PER_PRINT_PAGE = 16; // 4x4 grid, closer to real card size per the user's call

export default function DeckPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = use(params);
  const [loadState, setLoadState] = useState<"loading" | "notFound" | "error" | "ready">("loading");
  const [deck, setDeck] = useState<Deck | null>(null);
  const [knownCards, setKnownCards] = useState<Record<string, Card>>({});

  useEffect(() => {
    fetch(`/api/decks/${deckId}`)
      .then(async (res) => {
        if (res.status === 404) {
          setLoadState("notFound");
          return;
        }
        const body = await res.json();
        if (isApiError(body)) {
          setLoadState("error");
          return;
        }
        const { deck, resolvedCards } = body as { deck: Deck; resolvedCards: Record<string, Card> };
        setDeck(deck);
        setKnownCards(resolvedCards);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [deckId]);

  if (loadState === "loading") return <p className="text-ink-secondary px-4 py-6">Loading deck…</p>;
  if (loadState === "notFound") {
    return (
      <div className="px-4 py-6 space-y-2">
        <p className="font-medium">Deck not found</p>
        <Link href="/decks" className="text-sm text-ink-secondary hover:underline">
          Back to your decks →
        </Link>
      </div>
    );
  }
  if (loadState === "error" || !deck) {
    return <p className="text-danger-text px-4 py-6">Something went wrong loading this deck.</p>;
  }

  const pokemonTree = groupPokemonByEvolutionLine(deck.cards, knownCards);
  const pokemonEntries = flattenEvolutionTree(pokemonTree);
  const trainerGroups = groupTrainersByCategory(deck.cards, knownCards);
  const energyEntries = deck.cards
    .filter((e) => knownCards[e.cardId]?.supertype === "Energy")
    .sort((a, b) => a.cardName.localeCompare(b.cardName));

  // The full-art grid: one tile per unique card (never duplicated for
  // quantity — quantity shows as a badge instead), in the same reading
  // order as the list above. Cards that never resolved (no image) are
  // skipped here; they're still visible on the list page.
  const artOrder: DeckCardEntry[] = [...pokemonEntries, ...trainerGroups.flatMap((g) => g.entries), ...energyEntries];
  const artEntries = artOrder
    .map((e) => ({ entry: e, card: knownCards[e.cardId] }))
    .filter((x): x is { entry: DeckCardEntry; card: Card } => Boolean(x.card && (x.card.imageLarge || x.card.imageSmall)));
  const artPages = chunk(artEntries, CARDS_PER_PRINT_PAGE);

  return (
    <div className="px-4 py-6 print:px-0 print:py-0">
      <div className="flex items-center justify-between gap-3 mb-6 print:hidden">
        <Link href={`/decks/${deckId}`} className="text-sm text-ink-secondary hover:underline">
          ← Back to deck
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium"
        >
          Print
        </button>
      </div>

      {/* Page 1: the simple grouped list */}
      <section className="break-after-page">
        <h1 className="text-2xl font-semibold mb-1">{deck.name}</h1>
        <p className="text-sm text-ink-secondary mb-6">
          {deck.format === "all" ? "All formats" : `${deck.format[0]?.toUpperCase()}${deck.format.slice(1)}`} ·{" "}
          {deck.cards.reduce((s, e) => s + e.quantity, 0)} cards
        </p>

        {pokemonEntries.length > 0 && (
          <PrintListSection title="Pokémon" entries={pokemonEntries} knownCards={knownCards} />
        )}
        {trainerGroups.map(
          (group) =>
            group.entries.length > 0 && (
              <PrintListSection
                key={group.category}
                title={`Trainer — ${group.category}`}
                entries={group.entries}
                knownCards={knownCards}
              />
            ),
        )}
        {energyEntries.length > 0 && (
          <PrintListSection title="Energy" entries={energyEntries} knownCards={knownCards} />
        )}
      </section>

      {/* Sub pages: full-art grid, 16 per A4 page (4x4) */}
      {artPages.map((page, pageIndex) => (
        <section
          key={pageIndex}
          className={`grid grid-cols-4 grid-rows-4 gap-3 ${pageIndex < artPages.length - 1 ? "break-after-page" : ""}`}
        >
          {page.map(({ entry, card }) => (
            <div key={entry.cardId} className="relative aspect-[63/88]">
              {/* eslint-disable-next-line @next/next/no-img-element -- external, dynamic provider image, print-only */}
              <img
                src={card.imageLarge || card.imageSmall}
                alt={card.name}
                className="w-full h-full object-cover rounded-md"
              />
              {entry.quantity > 1 && (
                <span className="absolute bottom-1 right-1 rounded-full bg-black/80 text-white text-xs font-semibold px-2 py-0.5">
                  ×{entry.quantity}
                </span>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function PrintListSection({
  title,
  entries,
  knownCards,
}: {
  title: string;
  entries: DeckCardEntry[];
  knownCards: Record<string, Card>;
}) {
  const count = entries.reduce((s, e) => s + e.quantity, 0);
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-ink-secondary mb-1.5 break-inside-avoid">
        {title} ({count})
      </h2>
      <ul className="text-sm divide-y divide-neutral-100">
        {entries.map((entry) => {
          const card = knownCards[entry.cardId];
          const displayTypes = card ? resolveDisplayTypes(card) : [];
          return (
            <li key={entry.cardId} className="flex items-center gap-2 py-1 break-inside-avoid">
              <span className="w-6 shrink-0 tabular-nums text-ink-secondary">{entry.quantity}×</span>
              {displayTypes.length > 0 && <EnergyTypeStack types={displayTypes} size={14} />}
              <span className="flex-1 min-w-0 truncate">{entry.cardName}</span>
              {card && <span className="shrink-0 text-ink-muted text-xs">{card.setName}</span>}
              {!card && <span className="shrink-0 text-warning-text text-xs">Not found in catalogue</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
