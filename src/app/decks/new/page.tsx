"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isApiError } from "@/types/api";
import type { Deck } from "@/types/deck";
import type { DeckFormat } from "@/types/card";
import { AiDeckGeneratorForm } from "@/components/decks/AiDeckGeneratorForm";

export default function NewDeckPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "ai">("manual");
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
      <p className="text-sm text-ink-secondary">
        Decks are saved to this browser. Use a share link to view a deck elsewhere.
        Account-based cross-device access is not included in this version.
      </p>

      <div className="flex gap-2" role="tablist" aria-label="Deck creation method">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "manual"}
          onClick={() => setMode("manual")}
          className={`min-h-11 px-4 rounded-full text-sm border ${
            mode === "manual"
              ? "bg-primary text-primary-foreground border-primary"
              : "border-line-strong text-ink-secondary"
          }`}
        >
          Start manually
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "ai"}
          onClick={() => setMode("ai")}
          className={`min-h-11 px-4 rounded-full text-sm border ${
            mode === "ai"
              ? "bg-primary text-primary-foreground border-primary"
              : "border-line-strong text-ink-secondary"
          }`}
        >
          AI assist
        </button>
      </div>

      {mode === "manual" ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="deck-name" className="block text-sm font-medium mb-1">
              Deck name
            </label>
            <input
              id="deck-name"
              type="text"
              className="min-h-11 w-full rounded-md border border-line-strong px-3 text-sm"
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
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-line-strong text-ink-secondary"
                  }`}
                >
                  {f === "all" ? "All formats" : `${f[0]?.toUpperCase() ?? ""}${f.slice(1)}`}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-danger-text" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-11 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create deck"}
          </button>
        </form>
      ) : (
        <AiDeckGeneratorForm />
      )}
    </div>
  );
}
