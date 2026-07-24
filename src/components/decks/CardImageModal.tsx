"use client";

import { useEffect, useRef } from "react";
import type { Card } from "@/types/card";
import { EnergyTypeStack } from "@/components/cards/EnergyTypeIcon";
import { resolveDisplayTypes } from "@/lib/deck/validate";

export function CardImageModal({ card, onClose }: { card: Card; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElement = useRef<Element | null>(null);
  const displayTypes = resolveDisplayTypes(card);

  useEffect(() => {
    previouslyFocusedElement.current = document.activeElement;
    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocusedElement.current instanceof HTMLElement) {
        previouslyFocusedElement.current.focus();
      }
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${card.name} full-size image`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div className="max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        {card.imageLarge || card.imageSmall ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, dynamic provider image
          <img
            src={card.imageLarge || card.imageSmall}
            alt={card.name}
            className="w-full rounded-lg shadow-xl"
          />
        ) : (
          <div className="aspect-[63/88] w-full rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-400">
            No image
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-white/95 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium truncate">{card.name}</p>
            <p className="text-xs text-neutral-500 truncate">Set: {card.setName}</p>
          </div>
          {displayTypes.length > 0 && (
            <div className="shrink-0">
              <EnergyTypeStack types={displayTypes} size={22} />
            </div>
          )}
        </div>

        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="mt-2 min-h-11 w-full rounded-md bg-white text-sm font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
}
