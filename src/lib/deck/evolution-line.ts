import type { Card } from "@/types/card";

/**
 * Returns the names of cards that make up this card's evolution line,
 * excluding the card's own name — i.e. what it evolves from, and what it
 * can evolve into. Names only, not resolved cards: the caller is
 * responsible for looking up actual printings (there may be several, or
 * none in the catalogue).
 */
export function getEvolutionLineNames(card: Pick<Card, "evolvesFrom" | "evolvesTo">): string[] {
  const names = [...(card.evolvesFrom ? [card.evolvesFrom] : []), ...card.evolvesTo];
  return [...new Set(names)];
}
