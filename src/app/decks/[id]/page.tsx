"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CardSearchFilters, type CardFilterState } from "@/components/cards/CardSearchFilters";
import { AddCardTile } from "@/components/decks/AddCardTile";
import { Pagination } from "@/components/cards/Pagination";
import { DeckCardList } from "@/components/decks/DeckCardList";
import { DeckStatisticsPanel } from "@/components/decks/DeckStatisticsPanel";
import { DeckQualityPanel } from "@/components/decks/DeckQualityPanel";
import { ShareDeckPanel } from "@/components/decks/ShareDeckPanel";
import { DeckReviewPanel } from "@/components/decks/DeckReviewPanel";
import { CardImageModal } from "@/components/decks/CardImageModal";
import { computeDeckStatistics } from "@/lib/deck/statistics";
import { computeDeckQuality } from "@/lib/ai/deck-quality";
import { computeEstimatedDeckValue } from "@/lib/deck/deck-value";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { isApiError } from "@/types/api";
import type { Card, CardSearchResult, DeckFormat, CardSet } from "@/types/card";
import type { Deck, DeckCardEntry, DeckValidationResult, StrategyArchetype } from "@/types/deck";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const STATUS_LABEL: Record<Deck["status"], string> = {
  draft: "Draft",
  complete: "Complete",
  format_legal: "Format legal",
};

const STATUS_COLOR: Record<Deck["status"], string> = {
  draft: "bg-neutral-100 text-neutral-600",
  complete: "bg-blue-50 text-blue-700",
  format_legal: "bg-green-50 text-green-700",
};

const DEFAULT_FILTERS: CardFilterState = {
  name: "",
  supertype: "",
  pokemonType: "",
  setId: "",
  rarity: "",
  format: "all",
};

export default function DeckEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: deckId } = use(params);

  const [loadState, setLoadState] = useState<"loading" | "notFound" | "error" | "ready">("loading");
  const [generationExplanation, setGenerationExplanation] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [strategyNotes, setStrategyNotes] = useState("");
  const [strategyArchetype, setStrategyArchetype] = useState<StrategyArchetype | "">("");
  const [format, setFormat] = useState<DeckFormat>("standard");
  const [cards, setCards] = useState<DeckCardEntry[]>([]);
  const [knownCards, setKnownCards] = useState<Record<string, Card>>({});
  const [validation, setValidation] = useState<DeckValidationResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  const [sets, setSets] = useState<CardSet[]>([]);
  const [searchFilters, setSearchFilters] = useState<CardFilterState>(DEFAULT_FILTERS);
  const [searchPage, setSearchPage] = useState(1);
  const [searchResults, setSearchResults] = useState<CardSearchResult | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const debouncedSearchName = useDebouncedValue(searchFilters.name, 350);

  const undoSnapshot = useRef<DeckCardEntry[] | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const loadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pure client-side calculation from already-available state — updates
  // immediately on every deck change, no network round-trip and no AI call.
  const statistics = useMemo(
    () => computeDeckStatistics(cards, knownCards, format),
    [cards, knownCards, format],
  );
  const estimatedValue = useMemo(
    () => computeEstimatedDeckValue(cards, knownCards),
    [cards, knownCards],
  );
  const quality = useMemo(
    () => computeDeckQuality(cards, knownCards, statistics, strategyArchetype || null, format),
    [cards, knownCards, statistics, strategyArchetype, format],
  );

  // Show the AI's explanation once, immediately after landing here from
  // deck generation — read-and-clear, so it doesn't reappear on a later visit.
  useEffect(() => {
    const key = `deck-generation-explanation:${deckId}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      setGenerationExplanation(stored);
      sessionStorage.removeItem(key);
    }
  }, [deckId]);

  // Load the deck once on mount.
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
        const { deck, resolvedCards, validation } = body as {
          deck: Deck;
          resolvedCards: Record<string, Card>;
          validation: DeckValidationResult;
        };
        setName(deck.name);
        setStrategyNotes(deck.strategyNotes ?? "");
        setStrategyArchetype(deck.strategyArchetype ?? "");
        setFormat(deck.format);
        setCards(deck.cards);
        setKnownCards(resolvedCards);
        setValidation(validation);
        setShareEnabled(deck.shareEnabled);
        setShareToken(deck.shareToken);
        setLoadState("ready");
        // Defer autosave-triggering until after this initial state settles.
        setTimeout(() => {
          loadedRef.current = true;
        }, 0);
      })
      .catch(() => setLoadState("error"));
  }, [deckId]);

  // Fetch sets once for the filter dropdown.
  useEffect(() => {
    fetch("/api/sets")
      .then((res) => res.json())
      .then((body) => {
        if (!isApiError(body)) setSets(body.sets);
      })
      .catch(() => {});
  }, []);

  // Reset to page 1 whenever a filter actually changes.
  useEffect(() => {
    setSearchPage(1);
  }, [debouncedSearchName, searchFilters.supertype, searchFilters.pokemonType, searchFilters.setId, searchFilters.rarity]);

  // Search the catalogue while the deck stays visible alongside it.
  useEffect(() => {
    setSearchStatus("loading");
    const params = new URLSearchParams({ page: String(searchPage), pageSize: "12" });
    if (debouncedSearchName) params.set("name", debouncedSearchName);
    if (searchFilters.supertype) params.set("supertype", searchFilters.supertype);
    if (searchFilters.pokemonType) params.set("pokemonType", searchFilters.pokemonType);
    if (searchFilters.setId) params.set("setId", searchFilters.setId);
    if (searchFilters.rarity) params.set("rarity", searchFilters.rarity);

    const controller = new AbortController();
    fetch(`/api/cards?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (isApiError(body)) {
          setSearchStatus("error");
          return;
        }
        const result = body as CardSearchResult;
        setSearchResults(result);
        setKnownCards((prev) => {
          const next = { ...prev };
          for (const c of result.cards) next[c.id] = c;
          return next;
        });
        setSearchStatus("idle");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSearchStatus("error");
      });
    return () => controller.abort();
  }, [debouncedSearchName, searchFilters.supertype, searchFilters.pokemonType, searchFilters.setId, searchFilters.rarity, searchPage]);

  const scheduleSave = useCallback(
    (
      nextName: string,
      nextFormat: DeckFormat,
      nextCards: DeckCardEntry[],
      nextStrategyArchetype: StrategyArchetype | "",
      nextStrategyNotes: string,
    ) => {
      if (!loadedRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveStatus("saving");
      saveTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/decks/${deckId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: nextName,
              format: nextFormat,
              cards: nextCards,
              strategyArchetype: nextStrategyArchetype || null,
              strategyNotes: nextStrategyNotes.trim() || null,
            }),
          });
          const body = await res.json();
          if (isApiError(body)) {
            setSaveStatus("error");
            return;
          }
          const { resolvedCards, validation } = body as {
            resolvedCards: Record<string, Card>;
            validation: DeckValidationResult;
          };
          setKnownCards((prev) => ({ ...prev, ...resolvedCards }));
          setValidation(validation);
          setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }
      }, 800);
    },
    [deckId],
  );

  function pushUndoSnapshot(previous: DeckCardEntry[]) {
    undoSnapshot.current = previous;
    setCanUndo(true);
  }

  function mutateCards(updater: (prev: DeckCardEntry[]) => DeckCardEntry[]) {
    setCards((prev) => {
      pushUndoSnapshot(prev);
      const next = updater(prev);
      scheduleSave(name, format, next, strategyArchetype, strategyNotes);
      return next;
    });
  }

  function handleAddCard(card: Card) {
    setKnownCards((prev) => (prev[card.id] ? prev : { ...prev, [card.id]: card }));
    mutateCards((prev) => {
      const existing = prev.find((e) => e.cardId === card.id);
      if (existing) {
        return prev.map((e) => (e.cardId === card.id ? { ...e, quantity: e.quantity + 1 } : e));
      }
      return [...prev, { cardId: card.id, cardName: card.name, quantity: 1 }];
    });
  }

  function handleChangeQuantity(cardId: string, quantity: number) {
    mutateCards((prev) => {
      if (quantity <= 0) return prev.filter((e) => e.cardId !== cardId);
      return prev.map((e) => (e.cardId === cardId ? { ...e, quantity } : e));
    });
  }

  function handleRemoveAll(cardId: string) {
    mutateCards((prev) => prev.filter((e) => e.cardId !== cardId));
  }

  function handleApplySwap(
    remove: Array<{ cardId: string; count: number }>,
    add: Array<{ cardId: string; count: number }>,
  ) {
    mutateCards((prev) => {
      const byId = new Map(prev.map((e) => [e.cardId, { ...e }]));
      for (const r of remove) {
        const existing = byId.get(r.cardId);
        if (!existing) continue;
        existing.quantity -= r.count;
        if (existing.quantity <= 0) byId.delete(r.cardId);
      }
      for (const a of add) {
        const existing = byId.get(a.cardId);
        if (existing) {
          existing.quantity += a.count;
        } else {
          byId.set(a.cardId, {
            cardId: a.cardId,
            cardName: knownCards[a.cardId]?.name ?? a.cardId,
            quantity: a.count,
          });
        }
      }
      return [...byId.values()];
    });
  }

  function handleUndo() {
    if (!undoSnapshot.current) return;
    const restored = undoSnapshot.current;
    undoSnapshot.current = null;
    setCanUndo(false);
    setCards(restored);
    scheduleSave(name, format, restored, strategyArchetype, strategyNotes);
  }

  function handleNameBlur() {
    scheduleSave(name, format, cards, strategyArchetype, strategyNotes);
  }

  function handleStrategyNotesBlur() {
    scheduleSave(name, format, cards, strategyArchetype, strategyNotes);
  }

  function handleStrategyArchetypeChange(next: StrategyArchetype | "") {
    setStrategyArchetype(next);
    scheduleSave(name, format, cards, next, strategyNotes);
  }

  function handleFormatChange(nextFormat: DeckFormat) {
    setFormat(nextFormat);
    // Changing format never removes cards — only re-evaluates legality.
    scheduleSave(name, nextFormat, cards, strategyArchetype, strategyNotes);
  }

  if (loadState === "loading") {
    return <p className="text-neutral-500">Loading deck…</p>;
  }
  if (loadState === "notFound") {
    return (
      <div className="space-y-2">
        <p className="font-medium">Deck not found</p>
        <Link href="/decks/new" className="text-sm text-neutral-500 hover:underline">
          Start a new deck →
        </Link>
      </div>
    );
  }
  if (loadState === "error") {
    return <p className="text-red-600">Something went wrong loading this deck.</p>;
  }

  const errorCount = validation?.issues.filter((i) => i.severity === "error").length ?? 0;
  const totalCount = cards.reduce((s, e) => s + e.quantity, 0);

  return (
    <div className="space-y-4">
      {generationExplanation && (
        <div
          className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2"
          role="status"
        >
          <p className="text-sm text-neutral-700">
            <strong>AI-generated starting point:</strong> {generationExplanation}
          </p>
          <button
            type="button"
            onClick={() => setGenerationExplanation(null)}
            aria-label="Dismiss"
            className="min-h-11 px-2 text-neutral-400 shrink-0"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-[200px]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            aria-label="Deck name"
            className="text-2xl font-semibold w-full border-b border-transparent hover:border-neutral-300 focus:border-neutral-500 focus:outline-none"
            maxLength={100}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <select
              value={strategyArchetype}
              onChange={(e) => handleStrategyArchetypeChange(e.target.value as StrategyArchetype | "")}
              className="min-h-11 rounded-md border border-neutral-300 px-2 text-sm text-neutral-600"
              aria-label="Deck strategy archetype"
            >
              <option value="">Strategy (optional)</option>
              <option value="aggro">Aggro / Beatdown</option>
              <option value="control">Control / Stall</option>
              <option value="mill">Mill</option>
              <option value="other">Other</option>
            </select>
          </div>
          <input
            value={strategyNotes}
            onChange={(e) => setStrategyNotes(e.target.value)}
            onBlur={handleStrategyNotesBlur}
            aria-label="Deck strategy notes"
            placeholder={'Extra detail (optional) — e.g. "focused on early Charizard pressure"'}
            className="mt-1 text-sm w-full text-neutral-600 border-b border-transparent hover:border-neutral-300 focus:border-neutral-500 focus:outline-none placeholder:text-neutral-400"
            maxLength={300}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`text-xs rounded-full px-2.5 py-1 ${STATUS_COLOR[validation?.status ?? "draft"]}`}>
              {STATUS_LABEL[validation?.status ?? "draft"]}
            </span>
            <span className="text-sm text-neutral-500">{totalCount} / 60 cards</span>
            {errorCount > 0 && (
              <span className="text-xs rounded-full px-2.5 py-1 bg-red-50 text-red-700">
                {errorCount} issue{errorCount === 1 ? "" : "s"}
              </span>
            )}
            <span className="text-xs text-neutral-400" role="status" aria-live="polite">
              {saveStatus === "saving" && "Saving…"}
              {saveStatus === "saved" && "Saved"}
              {saveStatus === "error" && "Error saving — changes kept locally, will retry on next edit"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(["standard", "expanded", "all"] as DeckFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => handleFormatChange(f)}
              aria-pressed={format === f}
              className={`min-h-11 px-3 rounded-full text-sm border ${
                format === f ? "bg-neutral-900 text-white border-neutral-900" : "border-neutral-300"
              }`}
            >
              {f === "all" ? "All" : `${f[0]?.toUpperCase() ?? ""}${f.slice(1)}`}
            </button>
          ))}
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className="min-h-11 px-3 rounded-md border border-neutral-300 text-sm disabled:opacity-40"
          >
            Undo
          </button>
        </div>
      </div>

      {validation && validation.issues.length > 0 && (
        <ul className="text-sm space-y-1 rounded-md border border-neutral-200 p-3" role="status" aria-live="polite">
          {validation.issues.map((issue, i) => (
            <li key={i} className={issue.severity === "error" ? "text-red-700" : "text-neutral-600"}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-medium mb-2">Add cards</h2>
          <CardSearchFilters
            value={searchFilters}
            onChange={setSearchFilters}
            sets={sets}
            showFormatToggle={false}
          />
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {searchStatus === "loading" && <p className="text-sm text-neutral-400 col-span-full">Loading…</p>}
            {searchStatus === "error" && (
              <p className="text-sm text-red-600 col-span-full">Couldn&apos;t load search results.</p>
            )}
            {searchStatus === "idle" &&
              searchResults?.cards.map((card) => (
                <AddCardTile
                  key={card.id}
                  card={card}
                  format={format}
                  onAdd={handleAddCard}
                  onPreview={setPreviewCard}
                />
              ))}
            {searchStatus === "idle" && searchResults?.cards.length === 0 && (
              <p className="text-sm text-neutral-500 col-span-full">No cards found.</p>
            )}
          </div>
          {searchStatus === "idle" && searchResults && (
            <Pagination
              page={searchResults.page}
              pageSize={searchResults.pageSize}
              totalCount={searchResults.totalCount}
              onPageChange={setSearchPage}
            />
          )}
        </div>

        <div>
          <h2 className="font-medium mb-2">Deck</h2>
          <DeckCardList
            entries={cards}
            cardsById={knownCards}
            format={format}
            onChangeQuantity={handleChangeQuantity}
            onRemoveAll={handleRemoveAll}
            onAddCard={handleAddCard}
            onPreviewCard={setPreviewCard}
          />
        </div>
      </div>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="font-medium mb-3">Statistics</h2>
        <DeckStatisticsPanel stats={statistics} />
        {estimatedValue && (
          <p className="text-sm text-neutral-500 border-t border-neutral-200 mt-4 pt-3">
            Estimated value: <strong>${estimatedValue.total.toFixed(2)}</strong> (TCGplayer market price)
            {estimatedValue.missingPriceCount > 0 && (
              <span className="text-neutral-400">
                {" "}
                — {estimatedValue.missingPriceCount} card{estimatedValue.missingPriceCount === 1 ? "" : "s"}{" "}
                have no price data and aren&apos;t included
              </span>
            )}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="font-medium mb-3">
          Deck quality {strategyArchetype ? `(vs. ${strategyArchetype} benchmarks)` : "(vs. general benchmarks)"}
        </h2>
        <DeckQualityPanel quality={quality} />
      </section>

      <ShareDeckPanel
        deckId={deckId}
        shareEnabled={shareEnabled}
        shareToken={shareToken}
        onShareStateChange={({ shareEnabled, shareToken }) => {
          setShareEnabled(shareEnabled);
          setShareToken(shareToken);
        }}
      />

      <DeckReviewPanel
        deckId={deckId}
        knownCards={knownCards}
        onApplySwap={handleApplySwap}
        onPreviewCard={setPreviewCard}
        onResolvedCards={(cards) => setKnownCards((prev) => ({ ...prev, ...cards }))}
      />

      {previewCard && <CardImageModal card={previewCard} onClose={() => setPreviewCard(null)} />}
    </div>
  );
}
