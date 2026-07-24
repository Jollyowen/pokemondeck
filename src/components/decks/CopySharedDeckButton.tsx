"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isApiError } from "@/types/api";
import type { Deck } from "@/types/deck";

export function CopySharedDeckButton({ shareToken }: { shareToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/shared-decks/${shareToken}/copy`, { method: "POST" });
      const body = await res.json();
      if (isApiError(body)) {
        setError(body.error.message);
        setBusy(false);
        return;
      }
      const { deck } = body as { deck: Deck };
      router.push(`/decks/${deck.id}`);
    } catch {
      setError("Couldn't copy this deck. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={handleCopy}
        className="min-h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Copying…" : "Copy to my decks"}
      </button>
      {error && <p className="text-sm text-danger-text mt-2">{error}</p>}
    </div>
  );
}
