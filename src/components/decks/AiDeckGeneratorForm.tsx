"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { isApiError } from "@/types/api";
import type { Card, DeckFormat } from "@/types/card";
import type { Deck, StrategyArchetype } from "@/types/deck";

export function AiDeckGeneratorForm() {
  const router = useRouter();
  const [format, setFormat] = useState<DeckFormat>("standard");
  const [strategyArchetype, setStrategyArchetype] = useState<StrategyArchetype | "">("");
  const [pokemonName, setPokemonName] = useState("");
  const [strategyNotes, setStrategyNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<Card[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debouncedName = useDebouncedValue(pokemonName, 300);

  useEffect(() => {
    if (!debouncedName.trim()) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ name: debouncedName.trim(), supertype: "Pokémon", pageSize: "6" });
    fetch(`/api/cards?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (isApiError(body)) return;
        const cards = (body.cards as Card[]) ?? [];
        const seenNames = new Set<string>();
        const unique = cards.filter((c) => {
          if (seenNames.has(c.name)) return false;
          seenNames.add(c.name);
          return true;
        });
        setSuggestions(unique);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [debouncedName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/decks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          strategyArchetype: strategyArchetype || null,
          pokemonName: pokemonName.trim(),
          strategyNotes: strategyNotes.trim() || null,
        }),
      });
      const body = await res.json();
      if (isApiError(body)) {
        setError(body.error.message);
        setSubmitting(false);
        return;
      }
      const { deck, explanation } = body as { deck: Deck; explanation: string };
      if (explanation) {
        sessionStorage.setItem(`deck-generation-explanation:${deck.id}`, explanation);
      }
      router.push(`/decks/${deck.id}`);
    } catch {
      setError("Something went wrong generating the deck. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-ink-secondary">
        Describe what you want and the AI will propose a starting 60-card deck using real cards from the
        catalogue. You&apos;ll land in the normal deck editor afterwards to review, adjust, and complete it —
        nothing here is final.
      </p>

      <div className="relative">
        <label htmlFor="pokemon-name" className="block text-sm font-medium mb-1">
          Pokémon
        </label>
        <input
          id="pokemon-name"
          type="text"
          required
          autoComplete="off"
          className="min-h-11 w-full rounded-md border border-line-strong px-3 text-sm"
          placeholder="e.g. Charizard"
          value={pokemonName}
          onChange={(e) => {
            setPokemonName(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          maxLength={100}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-line bg-surface shadow-md max-h-48 overflow-auto">
            {suggestions.map((card) => (
              <li key={card.name}>
                <button
                  type="button"
                  onClick={() => {
                    setPokemonName(card.name);
                    setShowSuggestions(false);
                  }}
                  className="min-h-11 w-full text-left px-3 text-sm hover:bg-surface-muted"
                >
                  {card.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label htmlFor="generate-strategy" className="block text-sm font-medium mb-1">
          Style of play
        </label>
        <select
          id="generate-strategy"
          value={strategyArchetype}
          onChange={(e) => setStrategyArchetype(e.target.value as StrategyArchetype | "")}
          className="min-h-11 w-full rounded-md border border-line-strong px-2 text-sm"
        >
          <option value="">Let the AI decide</option>
          <option value="aggro">Aggro / Beatdown</option>
          <option value="control">Control / Stall</option>
          <option value="mill">Mill</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label htmlFor="generate-notes" className="block text-sm font-medium mb-1">
          Extra detail (optional)
        </label>
        <input
          id="generate-notes"
          type="text"
          className="min-h-11 w-full rounded-md border border-line-strong px-3 text-sm"
          placeholder='e.g. "focused on early pressure, keep it budget-friendly"'
          value={strategyNotes}
          onChange={(e) => setStrategyNotes(e.target.value)}
          maxLength={300}
        />
      </div>

      <div>
        <span className="block text-sm font-medium mb-1">Format</span>
        <div className="flex gap-2">
          {(["standard", "expanded", "all"] as DeckFormat[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              aria-pressed={format === f}
              className={`min-h-11 px-4 rounded-full text-sm border ${
                format === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-line-strong text-ink-secondary"
              }`}
            >
              {f === "all" ? "All formats" : `${f[0]?.toUpperCase() ?? ""}${f.slice(1)}`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-danger-text" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !pokemonName.trim()}
        className="min-h-11 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
      >
        {submitting ? "Generating… this can take a moment" : "Generate deck"}
      </button>
    </form>
  );
}
