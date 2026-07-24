"use client";

import Link from "next/link";
import type { Card, DeckFormat } from "@/types/card";
import { isCardLegalInFormat } from "@/lib/format-legality";
import { formatCardPrice } from "@/lib/format-price";

const FORMAT_LABEL: Record<DeckFormat, string> = {
  standard: "Standard",
  expanded: "Expanded",
  all: "All formats",
};

export function CardTile({ card, format }: { card: Card; format: DeckFormat }) {
  const legal = isCardLegalInFormat(card, format);
  const price = formatCardPrice(card.price);

  return (
    <Link
      href={`/cards/${card.id}`}
      className="group block rounded-lg border border-line p-2 hover:border-line-stronger focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-line-stronger"
    >
      <div className={legal ? "" : "grayscale opacity-50"}>
        {card.imageSmall ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, dynamic provider images
          <img
            src={card.imageSmall}
            alt={card.name}
            className="w-full rounded-md"
            loading="lazy"
          />
        ) : (
          <div className="aspect-[63/88] w-full rounded-md bg-surface-muted-2 flex items-center justify-center text-xs text-ink-muted">
            No image
          </div>
        )}
      </div>
      <p className="mt-2 text-sm font-medium truncate">{card.name}</p>
      <p className="text-xs text-ink-secondary truncate">
        {card.setName} · {card.number}
      </p>
      {price && <p className="text-xs text-ink-muted">{price}</p>}
      {!legal && (
        <p className="mt-1 text-xs text-warning-text bg-warning-bg rounded px-1.5 py-0.5 inline-block">
          Not legal in {FORMAT_LABEL[format]}
        </p>
      )}
    </Link>
  );
}
