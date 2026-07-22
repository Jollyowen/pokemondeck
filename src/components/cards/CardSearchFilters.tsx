"use client";

import { useEffect, useRef } from "react";
import type { CardSet, DeckFormat } from "@/types/card";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

export type CardFilterState = {
  name: string;
  supertype: "" | "Pokémon" | "Trainer" | "Energy";
  pokemonType: string;
  setId: string;
  rarity: string;
  format: DeckFormat;
};

const POKEMON_TYPES = [
  "Colorless",
  "Darkness",
  "Dragon",
  "Fairy",
  "Fighting",
  "Fire",
  "Grass",
  "Lightning",
  "Metal",
  "Psychic",
  "Water",
];

const COMMON_RARITIES = [
  "Common",
  "Uncommon",
  "Rare",
  "Rare Holo",
  "Rare Ultra",
  "Rare Secret",
];

const inputClass =
  "min-h-11 w-full rounded-md border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-500";

export function CardSearchFilters({
  value,
  onChange,
  onSubmit,
  sets,
  showFormatToggle = true,
}: {
  value: CardFilterState;
  onChange: (next: CardFilterState) => void;
  /**
   * Called when the search should actually run. The dropdowns call this
   * immediately on selection (passing the exact new state directly,
   * rather than relying on `value` having already updated by the time
   * this runs). The name field calls it too, debounced 350ms after the
   * last keystroke rather than on every single one — both are safe to
   * fire automatically now that search reads from the local database
   * instead of a rate-limited external API. Also fires on explicit
   * Enter/Search-button submission, for immediate control without
   * waiting out the debounce.
   */
  onSubmit: (overrideFilters?: CardFilterState) => void;
  sets: CardSet[];
  /**
   * Hide the format toggle in contexts that already have their own format
   * control elsewhere (e.g. the deck editor, where the deck's own
   * top-level format toggle already governs legality display for
   * everything — search results included — so a second, independent
   * format toggle inside the search filters was dead UI that looked like
   * it should affect results but never did.
   */
  showFormatToggle?: boolean;
}) {
  function update<K extends keyof CardFilterState>(key: K, next: CardFilterState[K]) {
    onChange({ ...value, [key]: next });
  }

  /** Used by the dropdowns: updates draft state and searches immediately with the new value, not a stale one. */
  function updateAndSearch<K extends keyof CardFilterState>(key: K, next: CardFilterState[K]) {
    const nextState = { ...value, [key]: next };
    onChange(nextState);
    onSubmit(nextState);
  }

  // The name field searches automatically too, now that local search
  // means there's no external rate limit to protect — but debounced
  // (350ms after the last keystroke), not on every single keystroke, and
  // deliberately NOT on initial mount (the isFirstRender guard), so
  // landing on this page still doesn't fire a search before anyone's
  // typed anything.
  const debouncedName = useDebouncedValue(value.name, 350);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-runs on the debounced name changing, not on every onSubmit/value identity change
  }, [debouncedName]);

  return (
    <form
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="lg:col-span-2">
        <label htmlFor="card-name" className="sr-only">
          Card name
        </label>
        <input
          id="card-name"
          type="text"
          placeholder="Search by name…"
          className={inputClass}
          value={value.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>

      <select
        aria-label="Card type"
        className={inputClass}
        value={value.supertype}
        onChange={(e) => updateAndSearch("supertype", e.target.value as CardFilterState["supertype"])}
      >
        <option value="">Any card type</option>
        <option value="Pokémon">Pokémon</option>
        <option value="Trainer">Trainer</option>
        <option value="Energy">Energy</option>
      </select>

      <select
        aria-label="Pokémon energy type"
        className={inputClass}
        value={value.pokemonType}
        onChange={(e) => updateAndSearch("pokemonType", e.target.value)}
      >
        <option value="">Any energy type</option>
        {POKEMON_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select
        aria-label="Set"
        className={inputClass}
        value={value.setId}
        onChange={(e) => updateAndSearch("setId", e.target.value)}
      >
        <option value="">Any set</option>
        {sets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Rarity"
        className={inputClass}
        value={value.rarity}
        onChange={(e) => updateAndSearch("rarity", e.target.value)}
      >
        <option value="">Any rarity</option>
        {COMMON_RARITIES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="min-h-11 rounded-md bg-neutral-900 text-white text-sm font-medium px-4"
      >
        Search
      </button>

      {showFormatToggle && (
        <fieldset className="lg:col-span-6 flex flex-wrap items-center gap-2">
          <legend className="text-sm font-medium mr-1">Format:</legend>
          {(["all", "standard", "expanded"] as DeckFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => update("format", format)}
              aria-pressed={value.format === format}
              className={`min-h-11 px-4 rounded-full text-sm border ${
                value.format === format
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "border-neutral-300 text-neutral-700"
              }`}
            >
              {format === "all" ? "All formats" : `${format[0]?.toUpperCase() ?? ""}${format.slice(1)}`}
            </button>
          ))}
          <span className="text-xs text-neutral-500">
            Cards not legal in the selected format stay visible, greyed out.
          </span>
        </fieldset>
      )}
    </form>
  );
}
