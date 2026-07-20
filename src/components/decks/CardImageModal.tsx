"use client";

import { useEffect } from "react";
import type { Card } from "@/types/card";

export function CardImageModal({ card, onClose }: { card: Card; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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
        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-11 w-full rounded-md bg-white text-sm font-medium"
        >
          Close
        </button>
      </div>
    </div>
  );
}
