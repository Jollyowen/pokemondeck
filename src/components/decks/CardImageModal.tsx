"use client";

import { useEffect, useRef } from "react";
import type { Card } from "@/types/card";
import { EnergyTypeStack } from "@/components/cards/EnergyTypeIcon";
import { resolveDisplayTypes } from "@/lib/deck/validate";

type CardImageModalProps = {
  card: Card;
  onClose: () => void;
  /**
   * The ordered list `card` came from, and `card`'s position in it —
   * both optional, and only meaningful together. When present and
   * longer than one card, prev/next controls render; single-card
   * contexts (e.g. a swap suggestion's before/after pair) simply don't
   * pass these, so no navigation UI appears where there's nothing to
   * step through.
   */
  cards?: Card[];
  currentIndex?: number;
  onNavigate?: (nextIndex: number) => void;
};

export function CardImageModal({ card, onClose, cards, currentIndex, onNavigate }: CardImageModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElement = useRef<Element | null>(null);
  const displayTypes = resolveDisplayTypes(card);

  const canNavigate = !!cards && cards.length > 1 && currentIndex !== undefined && !!onNavigate;
  const goTo = (delta: 1 | -1) => {
    if (!canNavigate || !cards) return;
    const next = (currentIndex! + delta + cards.length) % cards.length;
    onNavigate!(next);
  };

  useEffect(() => {
    previouslyFocusedElement.current = document.activeElement;
    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goTo(-1);
      if (e.key === "ArrowRight") goTo(1);
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocusedElement.current instanceof HTMLElement) {
        previouslyFocusedElement.current.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goTo closes over cards/currentIndex/onNavigate, re-bound each render is fine for a keydown listener re-attached on every relevant change via onClose/card identity below
  }, [onClose, card.id, currentIndex]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${card.name} full-size image`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div className="max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          {card.imageLarge || card.imageSmall ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, dynamic provider image
            <img
              src={card.imageLarge || card.imageSmall}
              alt={card.name}
              className="w-full rounded-lg shadow-xl"
            />
          ) : (
            <div className="aspect-[63/88] w-full rounded-lg bg-surface-muted-2 flex items-center justify-center text-ink-muted">
              No image
            </div>
          )}

          {canNavigate && (
            <>
              <button
                type="button"
                onClick={() => goTo(-1)}
                aria-label="Previous card"
                className="absolute left-1 top-1/2 -translate-y-1/2 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full bg-surface/90 text-lg shadow-md focus:outline-none focus:ring-2 focus:ring-line-stronger"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => goTo(1)}
                aria-label="Next card"
                className="absolute right-1 top-1/2 -translate-y-1/2 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full bg-surface/90 text-lg shadow-md focus:outline-none focus:ring-2 focus:ring-line-stronger"
              >
                ›
              </button>
            </>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-surface/95 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium truncate">{card.name}</p>
            <p className="text-xs text-ink-secondary truncate">
              Set: {card.setName}
              {canNavigate && (
                <span className="text-ink-muted"> · {currentIndex! + 1} of {cards!.length}</span>
              )}
            </p>
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
          className="mt-2 min-h-11 w-full rounded-md bg-surface text-sm font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
}
