"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isApiError } from "@/types/api";
import type { Deck } from "@/types/deck";
import type { DeckFormat } from "@/types/card";

export default function NewDeckPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<DeckFormat>("standard");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Untitled deck", format }),
      });
      const body = await res.json();
      if (isApiError(body)) {
        setError(body.error.message);
        setSubmitting(false);
        return;
      }
      const { deck } = body as { deck: Deck };
      router.push(`/decks/${deck.id}`);
    } catch {
      setError("Something went wrong creating the deck. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">New deck</h1>
      <p className="text-sm text-neutral-500">
        Decks are saved to this browser. Use a share link to view a deck elsewhere.
        Account-based cross-device access is not included in this version.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="deck-name" className="block text-sm font-medium mb-1">
            Deck name
          </label>
          <input
            id="deck-name"
            type="text"
            className="min-h-11 w-full rounded-md border border-neutral-300 px-3 text-sm"
            placeholder="e.g. Charizard ex Control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </div>

        <div>
          <span className="block text-sm font-medium mb-1">Format</span>
          <div className="flex gap-2">
            {(["standard", "expanded", "all"] as DeckFormat[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                aria-pressed={format === f}
                className={`min-h-11 px-4 rounded-full text-sm border ${
                  format === f
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "border-neutral-300 text-neutral-700"
                }`}
              >
                {f === "all" ? "All formats" : `${f[0]?.toUpperCase() ?? ""}${f.slice(1)}`}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 px-5 rounded-md bg-neutral-900 text-white text-sm font-medium disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create deck"}
        </button>
      </form>
    </div>
  );
}
