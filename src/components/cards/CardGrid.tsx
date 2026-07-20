import type { Card, DeckFormat } from "@/types/card";
import { CardTile } from "@/components/cards/CardTile";

export function CardGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-neutral-200 p-2 animate-pulse">
          <div className="aspect-[63/88] w-full rounded-md bg-neutral-100" />
          <div className="mt-2 h-3 w-3/4 rounded bg-neutral-100" />
          <div className="mt-1 h-3 w-1/2 rounded bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

export function CardGrid({ cards, format }: { cards: Card[]; format: DeckFormat }) {
  if (cards.length === 0) {
    return (
      <div className="py-16 text-center text-neutral-500">
        <p className="font-medium">No cards found</p>
        <p className="text-sm mt-1">Try a different name or clearing some filters.</p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
      role="list"
    >
      {cards.map((card) => (
        <div key={card.id} role="listitem">
          <CardTile card={card} format={format} />
        </div>
      ))}
    </div>
  );
}
