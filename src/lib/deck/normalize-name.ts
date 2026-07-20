/**
 * Normalises a card name for copy-limit grouping: trims whitespace and
 * case-folds. Deliberately does NOT attempt fuzzy matching across
 * different names — "Pikachu" and "Pikachu V" are different names and
 * must never be combined, even though they represent the same character.
 */
export function normalizeCardName(name: string): string {
  return name.trim().toLowerCase();
}
