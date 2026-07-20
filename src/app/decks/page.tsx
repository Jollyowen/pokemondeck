"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isApiError } from "@/types/api";
import type { DeckFormat } from "@/types/card";
import type { DeckStatus } from "@/types/deck";

type SortBy = "updated_at" | "name" | "format";

type DeckListItem = {
  id: string;
  name: string;
  format: DeckFormat;
  status: DeckStatus;
  cardCount: number;
  updatedAt: string;
};

const STATUS_LABEL: Record<DeckStatus, string> = {
  draft: "Draft",
  complete: "Complete",
  format_legal: "Format legal",
};

const STATUS_COLOR: Record<DeckStatus, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  complete: "bg-blue-50 text-blue-700",
  format_legal: "bg-green-50 text-green-700",
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
          className="min-h-11 inline-flex items-center rounded-md bg-neutral-900 px-4 text-white text-sm font-medium"
        >
          New deck
        </Link>
      </div>

      <p className="text-sm text-neutral-500">
        Decks are saved to this browser. Use a share link to view a deck elsewhere.
        Account-based cross-device access is not included in this version.
      </p>

      {decks && decks.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-sm text-neutral-600">
            Sort by
          </label>
          <select
            id="sort"
            className="min-h-11 rounded-md border border-neutral-300 px-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortBy)}
          >
            <option value="updated_at">Last updated</option>
            <option value="name">Name</option>
            <option value="format">Format</option>
          </select>
        </div>
      )}

      {status === "loading" && <p className="text-neutral-500">Loading decks…</p>}
      {status === "error" && <p className="text-red-600">Couldn&apos;t load your decks. Please try again.</p>}

      {status === "idle" && decks && decks.length === 0 && (
        <div className="py-16 text-center text-neutral-500">
          <p className="font-medium">No decks yet</p>
          <p className="text-sm mt-1">
            <Link href="/decks/new" className="underline">
              Create your first deck
            </Link>
          </p>
        </div>
      )}

      {status === "idle" && decks && decks.length > 0 && (
        <ul className="space-y-2">
          {decks.map((deck) => (
            <li
              key={deck.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 p-3"
            >
              <div className="flex-1 min-w-[180px]">
                {renamingId === deck.id ? (
                  <input
                    autoFocus
                    className="min-h-11 w-full rounded-md border border-neutral-300 px-2 text-sm font-medium"
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
                  <Link href={`/decks/${deck.id}`} className="font-medium hover:underline">
                    {deck.name}
                  </Link>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span className={`rounded-full px-2 py-0.5 ${STATUS_COLOR[deck.status]}`}>
                    {STATUS_LABEL[deck.status]}
                  </span>
                  <span className="capitalize">{deck.format === "all" ? "All formats" : deck.format}</span>
                  <span>{deck.cardCount} / 60 cards</span>
                  <span>Updated {formatDate(deck.updatedAt)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                <Link
                  href={`/decks/${deck.id}`}
                  className="min-h-11 inline-flex items-center px-3 rounded-md border border-neutral-300 text-sm"
                >
                  Open
                </Link>
                <button
                  type="button"
                  className="min-h-11 px-3 rounded-md border border-neutral-300 text-sm"
                  onClick={() => {
                    setRenamingId(deck.id);
                    setRenameValue(deck.name);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="min-h-11 px-3 rounded-md border border-neutral-300 text-sm"
                  onClick={() => handleDuplicate(deck.id)}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="min-h-11 px-3 rounded-md border border-red-200 text-red-700 text-sm"
                  onClick={() => handleDelete(deck.id, deck.name)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {undoToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-lg bg-neutral-900 text-white px-4 py-3 shadow-lg">
          <span className="text-sm">Deleted &quot;{undoToast.name}&quot;</span>
          <button
            type="button"
            className="min-h-11 px-3 rounded-md bg-white/10 text-sm font-medium"
            onClick={handleUndoDelete}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
