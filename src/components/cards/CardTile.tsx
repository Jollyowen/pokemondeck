"use client";

import Link from "next/link";
import type { Card, DeckFormat } from "@/types/card";
import { isCardLegalInFormat } from "@/lib/format-legality";

const FORMAT_LABEL: Record<DeckFormat, string> = {
  standard: "Standard",
  expanded: "Expanded",
  all: "All formats",
};

export function CardTile({ card, format }: { card: Card; format: DeckFormat }) {
  const legal = isCardLegalInFormat(card, format);

  return (
    <Link
      href={`/cards/${card.id}`}
      className="group block rounded-lg border border-neutral-200 p-2 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500"
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
          <div className="aspect-[63/88] w-full rounded-md bg-neutral-100 flex items-center justify-center text-xs text-neutral-400">
            No image
          </div>
        )}
      </div>
      <p className="mt-2 text-sm font-medium truncate">{card.name}</p>
      <p className="text-xs text-neutral-500 truncate">
        {card.setName} · {card.number}
      </p>
      {!legal && (
        <p className="mt-1 text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 inline-block">
          Not legal in {FORMAT_LABEL[format]}
        </p>
      )}
    </Link>
  );
}
