"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isApiError } from "@/types/api";
import type { DeckFormat } from "@/types/card";
import type { DeckStatus } from "@/types/deck";
import { EnergyTypeStack } from "@/components/cards/EnergyTypeIcon";
import { DeckStackThumbnail } from "@/components/decks/DeckStackThumbnail";
import { OpenIcon, RenameIcon, DuplicateIcon, DeleteIcon } from "@/components/decks/DeckActionIcons";
import { CardBrowser } from "@/components/cards/CardBrowser";

type SortBy = "updated_at" | "name" | "format";

type DeckListItem = {
  id: string;
  name: string;
  format: DeckFormat;
  status: DeckStatus;
  cardCount: number;
  updatedAt: string;
  mainPokemonCardId: string | null;
  // Optional here (even though the server always sends them) because this
  // type is also what a stale test fixture / older cached response looks
  // like — the render must degrade gracefully, not crash, if these are
  // missing.
  mainPokemonImageSmall?: string | null;
  energyTypes?: string[];
  estimatedValue?: { total: number; currency: "USD"; missingPriceCount: number } | null;
};

const STATUS_LABEL: Record<DeckStatus, string> = {
  draft: "Draft",
  complete: "Complete",
  format_legal: "Format legal",
};

const STATUS_COLOR: Record<DeckStatus, string> = {
  draft: "bg-surface-muted-2 text-ink-secondary",
  complete: "bg-info-bg text-info-text",
  format_legal: "bg-success-bg text-success-text",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function DeckLibraryPage() {
  const [sort, setSort] = useState<SortBy>("updated_at");
  const [decks, setDecks] = useState<DeckListItem[] | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "idle">("loading");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [undoToast, setUndoToast] = useState<{ deckId: string; name: string } | null>(null);

  function loadDecks(nextSort: SortBy) {
    setStatus("loading");
    fetch(`/api/decks?sort=${nextSort}`)
      .then(async (res) => {
        const body = await res.json();
        if (isApiError(body)) {
          setStatus("error");
          return;
        }
        setDecks((body as { decks: DeckListItem[] }).decks);
        setStatus("idle");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(() => {
    loadDecks(sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  useEffect(() => {
    if (!undoToast) return;
    const timer = setTimeout(() => setUndoToast(null), 6000);
    return () => clearTimeout(timer);
  }, [undoToast]);

  async function handleRenameSubmit(deckId: string) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name || !decks) return;

    const previous = decks;
    setDecks(decks.map((d) => (d.id === deckId ? { ...d, name } : d)));

    const res = await fetch(`/api/decks/${deckId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = await res.json();
    if (isApiError(body)) {
      setDecks(previous); // revert on failure
    }
  }

  async function handleDuplicate(deckId: string) {
    const res = await fetch(`/api/decks/${deckId}/duplicate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const body = await res.json();
    if (!isApiError(body)) {
      loadDecks(sort);
    }
  }

  async function handleDelete(deckId: string, name: string) {
    if (!window.confirm(`Delete "${name}"? You can undo this for a few seconds after.`)) return;
    if (!decks) return;

    setDecks(decks.filter((d) => d.id !== deckId));
    const res = await fetch(`/api/decks/${deckId}`, { method: "DELETE" });
    const body = await res.json();
    if (!isApiError(body)) {
      setUndoToast({ deckId, name });
    } else {
      loadDecks(sort); // restore the list from the server if delete actually failed
    }
  }

  async function handleUndoDelete() {
    if (!undoToast) return;
    const { deckId } = undoToast;
    setUndoToast(null);
    const res = await fetch(`/api/decks/${deckId}/restore`, { method: "POST" });
    const body = await res.json();
    if (!isApiError(body)) {
      loadDecks(sort);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Your decks</h1>
        <Link
          href="/decks/new"
          className="min-h-11 inline-flex items-center rounded-md bg-primary px-4 text-primary-foreground text-sm font-medium"
        >
          New deck
        </Link>
      </div>

      <p className="text-sm text-ink-secondary">
        Decks are saved to this browser. Use a share link to view a deck elsewhere.
        Account-based cross-device access is not included in this version.
      </p>

      {decks && decks.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-sm text-ink-secondary">
            Sort by
          </label>
          <select
            id="sort"
            className="min-h-11 rounded-md border border-line-strong px-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortBy)}
          >
            <option value="updated_at">Last updated</option>
            <option value="name">Name</option>
            <option value="format">Format</option>
          </select>
        </div>
      )}

      {status === "loading" && <p className="text-ink-secondary">Loading decks…</p>}
      {status === "error" && (
        <p className="text-danger-text" role="alert">
          Couldn&apos;t load your decks. Please try again.
        </p>
      )}

      {status === "idle" && decks && decks.length === 0 && (
        <div className="py-16 text-center text-ink-secondary">
          <p className="font-medium">No decks yet</p>
          <p className="text-sm mt-1">
            <Link href="/decks/new" className="underline">
              Create your first deck
            </Link>
          </p>
        </div>
      )}

      {status === "idle" && decks && decks.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {decks.map((deck) => (
            <li key={deck.id} className="flex flex-col rounded-lg border border-line p-4">
              <div className="min-w-0">
                <div className="flex items-start gap-1.5">
                  {(deck.energyTypes ?? []).length > 0 && (
                    <div className="pt-0.5 shrink-0">
                      <EnergyTypeStack types={deck.energyTypes ?? []} size={18} />
                    </div>
                  )}
                  {renamingId === deck.id ? (
                    <input
                      autoFocus
                      aria-label={`Rename ${deck.name}`}
                      className="min-h-11 w-full min-w-0 rounded-md border border-line-strong px-2 text-sm font-medium"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(deck.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit(deck.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      maxLength={100}
                    />
                  ) : (
                    <Link href={`/decks/${deck.id}`} className="font-medium hover:underline break-words">
                      {deck.name}
                    </Link>
                  )}
                </div>
              </div>

              <div className="mt-2">
                <DeckStackThumbnail imageSmall={deck.mainPokemonImageSmall ?? null} deckName={deck.name} />
              </div>

              <div className="mt-3 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-secondary">
                  <span className={`rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_COLOR[deck.status]}`}>
                    {STATUS_LABEL[deck.status]}
                  </span>
                  <span className="capitalize whitespace-nowrap">
                    {deck.format === "all" ? "All formats" : deck.format}
                  </span>
                  <span className="whitespace-nowrap">{deck.cardCount} / 60 cards</span>
                  {deck.estimatedValue && (
                    <span
                      className="whitespace-nowrap"
                      title={
                        deck.estimatedValue.missingPriceCount > 0
                          ? `${deck.estimatedValue.missingPriceCount} card(s) have no price data and aren't included`
                          : "TCGplayer market price"
                      }
                    >
                      ${deck.estimatedValue.total.toFixed(2)}
                      {deck.estimatedValue.missingPriceCount > 0 ? "+" : ""}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-ink-muted">Updated {formatDate(deck.updatedAt)}</div>
              </div>

              <div className="mt-3 pt-3 border-t border-line flex items-center justify-between gap-1">
                <Link
                  href={`/decks/${deck.id}`}
                  title={`Open ${deck.name}`}
                  aria-label={`Open ${deck.name}`}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md border border-line-strong text-ink-secondary hover:bg-surface-muted"
                >
                  <OpenIcon />
                </Link>
                <button
                  type="button"
                  title={`Rename ${deck.name}`}
                  aria-label={`Rename ${deck.name}`}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md border border-line-strong text-ink-secondary hover:bg-surface-muted"
                  onClick={() => {
                    setRenamingId(deck.id);
                    setRenameValue(deck.name);
                  }}
                >
                  <RenameIcon />
                </button>
                <button
                  type="button"
                  title={`Duplicate ${deck.name}`}
                  aria-label={`Duplicate ${deck.name}`}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md border border-line-strong text-ink-secondary hover:bg-surface-muted"
                  onClick={() => handleDuplicate(deck.id)}
                >
                  <DuplicateIcon />
                </button>
                <button
                  type="button"
                  title={`Delete ${deck.name}`}
                  aria-label={`Delete ${deck.name}`}
                  className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md border border-danger-border text-danger-text hover:bg-danger-bg"
                  onClick={() => handleDelete(deck.id, deck.name)}
                >
                  <DeleteIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {undoToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-lg bg-primary text-primary-foreground px-4 py-3 shadow-lg">
          <span className="text-sm">Deleted &quot;{undoToast.name}&quot;</span>
          <button
            type="button"
            className="min-h-11 px-3 rounded-md bg-primary-foreground/10 text-sm font-medium"
            onClick={handleUndoDelete}
          >
            Undo
          </button>
        </div>
      )}

      {status === "idle" && decks && (
        <div className="pt-6 border-t border-line">
          <CardBrowser heading="Search cards" />
        </div>
      )}
    </div>
  );
}
