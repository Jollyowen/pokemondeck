import type { CardPrice } from "@/types/card";

export function formatCardPrice(price: CardPrice | null): string | null {
  if (!price || price.market === null) return null;
  return `$${price.market.toFixed(2)}`;
}
