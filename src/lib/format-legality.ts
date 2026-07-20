import type { Card, DeckFormat } from "@/types/card";

/**
 * "all" means no format restriction, not the Unlimited format — a card is
 * always considered legal when "all" is selected.
 */
export function isCardLegalInFormat(card: Card, format: DeckFormat): boolean {
  if (format === "all") return true;
  return card.legalities[format] === "legal";
}
