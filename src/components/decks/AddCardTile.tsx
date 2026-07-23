"use client";

import type { Card, DeckFormat } from "@/types/card";
import { isCardLegalInFormat } from "@/lib/format-legality";
import { formatCardPrice } from "@/lib/format-price";

export function AddCardTile({
  card,
  format,
  onAdd,
  onPreview,
}: {
  card: Card;
  format: DeckFormat;
  onAdd: (card: Card) => void;
  onPreview: (card: Card) => void;
}) {
  const legal = isCardLegalInFormat(card, format);
  const price = formatCardPrice(card.price);

  function handleAdd() {
    if (!legal && !window.confirm(`${card.name} is not legal in the selected format. Add it anyway?`)) {
      return;
    }
    onAdd(card);
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-2">
      <button
        type="button"
        onClick={() => onPreview(card)}
        aria-label={`View larger image of ${card.name}`}
        className={`block w-full focus:outline-none focus:ring-2 focus:ring-neutral-500 rounded-md ${
          legal ? "" : "grayscale opacity-50"
        }`}
      >
        {card.imageSmall ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, dynamic provider image
          <img src={card.imageSmall} alt={card.name} className="w-full rounded-md" loading="lazy" />
        ) : (
          <div className="aspect-[63/88] w-full rounded-md bg-neutral-100" />
        )}
      </button>
      <p className="mt-1 text-xs font-medium truncate">{card.name}</p>
      <p className="text-xs text-neutral-500 truncate">
        {card.setName} · {card.number}
      </p>
      {price && <p className="text-xs text-neutral-400">{price}</p>}
      <button
        type="button"
        onClick={handleAdd}
        className="mt-1 min-h-11 w-full rounded-md bg-neutral-900 text-white text-xs font-medium"
      >
        Add
      </button>
    </div>
  );
}
