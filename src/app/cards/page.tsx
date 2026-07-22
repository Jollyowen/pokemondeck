"use client";

import { useEffect, useState } from "react";
import { CardSearchFilters, type CardFilterState } from "@/components/cards/CardSearchFilters";
import { CardGrid, CardGridSkeleton } from "@/components/cards/CardGrid";
import { Pagination } from "@/components/cards/Pagination";
import { isApiError } from "@/types/api";
import type { Card, CardSet, CardSearchResult } from "@/types/card";

const DEFAULT_FILTERS: CardFilterState = {
  name: "",
  supertype: "",
  pokemonType: "",
  setId: "",
  rarity: "",
  format: "all",
};

export default function CardsPage() {
  // "Draft" filters are what's bound to the form inputs — they update live
  // as the person types/selects, but never trigger a search by themselves.
  const [filters, setFilters] = useState<CardFilterState>(DEFAULT_FILTERS);
  // "Active" search is a snapshot taken only when Search is actually
  // submitted (button or Enter). Nothing fetches until this is set at
  // least once — no more silently browsing the entire catalogue the
  // moment this page loads, before anyone has asked for anything.
  const [activeSearch, setActiveSearch] = useState<CardFilterState | null>(null);
  const [page, setPage] = useState(1);
  const [sets, setSets] = useState<CardSet[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(24);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "not_searched">("not_searched");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    fetch("/api/sets")
      .then((res) => res.json())
      .then((body) => {
        if (!isApiError(body)) setSets(body.sets);
      })
      .catch(() => {
        // Non-critical: the set filter simply stays empty if this fails.
      });
  }, []);

  useEffect(() => {
    if (!activeSearch) return; // nothing searched yet — no request to make

    const controller = new AbortController();
    setStatus("loading");
    setErrorMessage(null);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (activeSearch.name) params.set("name", activeSearch.name);
    if (activeSearch.supertype) params.set("supertype", activeSearch.supertype);
    if (activeSearch.pokemonType) params.set("pokemonType", activeSearch.pokemonType);
    if (activeSearch.setId) params.set("setId", activeSearch.setId);
    if (activeSearch.rarity) params.set("rarity", activeSearch.rarity);

    fetch(`/api/cards?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (isApiError(body)) {
          setErrorMessage(body.error.message);
          setStatus("error");
          setCards([]);
          setTotalCount(0);
          return;
        }
        const result = body as CardSearchResult & { degraded?: boolean };
        setCards(result.cards);
        setTotalCount(result.totalCount);
        setDegraded(Boolean(result.degraded));
        setStatus("idle");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setErrorMessage("Something went wrong loading cards. Please try again.");
        setStatus("error");
      });

    return () => controller.abort();
  }, [activeSearch, page, pageSize]);

  function handleSearchSubmit(overrideFilters?: CardFilterState) {
    setPage(1);
    setActiveSearch(overrideFilters ?? { ...filters });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Card catalogue</h1>

      <CardSearchFilters value={filters} onChange={setFilters} onSubmit={handleSearchSubmit} sets={sets} />

      {degraded && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
          The live card catalogue is temporarily unavailable — showing previously cached
          results, which may be incomplete.
        </p>
      )}

      {status === "not_searched" && (
        <div className="py-16 text-center text-neutral-500">
          <p className="font-medium">Search or filter to see cards</p>
          <p className="text-sm mt-1">
            Enter a name, choose a filter, or just press Search to browse.
          </p>
        </div>
      )}

      {status === "loading" && <CardGridSkeleton />}

      {status === "error" && (
        <div className="py-16 text-center text-neutral-600" role="alert">
          <p className="font-medium">Couldn&apos;t load cards</p>
          <p className="text-sm mt-1">{errorMessage}</p>
        </div>
      )}

      {status === "idle" && (
        <>
          <CardGrid cards={cards} format={filters.format} />
          <Pagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
