import type { Card } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";

export type EvolutionGroupNode = {
  /** Card name shared by every entry at this node (there can be more than one printing of the same name). */
  name: string;
  entries: DeckCardEntry[];
  children: EvolutionGroupNode[];
};

/**
 * Groups a deck's Pokémon entries into evolution-line trees: the Basic
 * forms the root, with its evolutions nested underneath. Grouping is by
 * card *name* (matching evolvesFrom/evolvesTo, which are names, not ids),
 * so multiple printings of the same Pokémon collapse into one node rather
 * than duplicating the line once per printing.
 *
 * A card whose evolvesFrom isn't itself present in the deck becomes a
 * root of its own — e.g. a lone Stage 1 with no copy of its Basic in the
 * deck yet still needs somewhere to render, rather than being dropped.
 */
export function groupPokemonByEvolutionLine(
  entries: DeckCardEntry[],
  cardsById: Record<string, Card>,
): EvolutionGroupNode[] {
  const pokemonEntries = entries.filter((e) => cardsById[e.cardId]?.supertype === "Pokémon");

  const entriesByName = new Map<string, DeckCardEntry[]>();
  const evolvesFromByName = new Map<string, string | null>();
  for (const entry of pokemonEntries) {
    const card = cardsById[entry.cardId];
    if (!card) continue;
    const list = entriesByName.get(card.name) ?? [];
    list.push(entry);
    entriesByName.set(card.name, list);
    // First printing seen for a name determines its evolvesFrom for
    // grouping purposes — different printings of the same named card
    // share the same evolution line in practice.
    if (!evolvesFromByName.has(card.name)) {
      evolvesFromByName.set(card.name, card.evolvesFrom ?? null);
    }
  }

  function buildNode(name: string): EvolutionGroupNode {
    const children = [...entriesByName.keys()]
      .filter((candidate) => evolvesFromByName.get(candidate) === name)
      .sort((a, b) => a.localeCompare(b))
      .map(buildNode);
    return { name, entries: entriesByName.get(name) ?? [], children };
  }

  const rootNames = [...entriesByName.keys()]
    .filter((name) => {
      const from = evolvesFromByName.get(name);
      return !from || !entriesByName.has(from);
    })
    .sort((a, b) => a.localeCompare(b));

  return rootNames.map(buildNode);
}

export type TrainerCategory = "Item" | "Supporter" | "Stadium" | "Tool" | "ACE SPEC" | "Other";

export const TRAINER_CATEGORY_ORDER: TrainerCategory[] = ["Item", "Supporter", "Stadium", "Tool", "ACE SPEC", "Other"];

/**
 * Classifies a Trainer card into a display subtype. ACE SPEC is checked
 * first since an ACE SPEC card's other subtype (e.g. "Item") is still
 * present alongside it — the brief wants ACE SPEC as its own bucket
 * regardless of what it's also tagged as.
 */
export function trainerCategory(card: Pick<Card, "subtypes">): TrainerCategory {
  const subtypes = card.subtypes.map((s) => s.toLowerCase());
  if (subtypes.includes("ace spec")) return "ACE SPEC";
  if (subtypes.includes("supporter")) return "Supporter";
  if (subtypes.includes("stadium")) return "Stadium";
  if (subtypes.some((s) => s.includes("tool"))) return "Tool";
  if (subtypes.includes("item")) return "Item";
  return "Other";
}

export type TrainerGroup = {
  category: TrainerCategory;
  entries: DeckCardEntry[];
};

/** Splits a deck's Trainer entries into the five requested subtype buckets, in a fixed display order. */
export function groupTrainersByCategory(entries: DeckCardEntry[], cardsById: Record<string, Card>): TrainerGroup[] {
  const trainerEntries = entries.filter((e) => cardsById[e.cardId]?.supertype === "Trainer");

  const byCategory = new Map<TrainerCategory, DeckCardEntry[]>();
  for (const entry of trainerEntries) {
    const card = cardsById[entry.cardId];
    if (!card) continue;
    const category = trainerCategory(card);
    const list = byCategory.get(category) ?? [];
    list.push(entry);
    byCategory.set(category, list);
  }

  for (const list of byCategory.values()) {
    list.sort((a, b) => a.cardName.localeCompare(b.cardName));
  }

  return TRAINER_CATEGORY_ORDER.map((category) => ({ category, entries: byCategory.get(category) ?? [] })).filter(
    (g) => g.entries.length > 0,
  );
}
