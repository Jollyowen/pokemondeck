"use client";

import { useEffect, useState } from "react";
import { isApiError } from "@/types/api";
import type { Card } from "@/types/card";
import type { DeckReviewResult } from "@/types/deck";

const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-neutral-100 text-neutral-600",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
};

function CardRef({ id, knownCards }: { id: string; knownCards: Record<string, Card> }) {
  return <span className="text-neutral-500">{knownCards[id]?.name ?? id}</span>;
}

export function DeckReviewPanel({
  deckId,
  knownCards,
  onApplySwap,
}: {
  deckId: string;
  knownCards: Record<string, Card>;
  onApplySwap: (remove: Array<{ cardId: string; count: number }>, add: Array<{ cardId: string; count: number }>) => void;
}) {
  const [review, setReview] = useState<DeckReviewResult | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "generating" | "error" | "rate_limited">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load whatever review already exists, without generating a new one.
  useEffect(() => {
    fetch(`/api/decks/${deckId}/reviews/latest`)
      .then(async (res) => {
        const body = await res.json();
        if (isApiError(body)) {
          setStatus("idle");
          return;
        }
        const outcome = body.review as { review: { result: DeckReviewResult }; isStale: boolean } | null;
        if (outcome) {
          setReview(outcome.review.result);
          setIsStale(outcome.isStale);
        }
        setStatus("idle");
      })
      .catch(() => setStatus("idle"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  async function handleGenerate() {
    setStatus("generating");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/review`, { method: "POST" });
      const body = await res.json();
      if (isApiError(body)) {
        if (res.status === 429) {
          setStatus("rate_limited");
          setErrorMessage(body.error.message);
          return;
        }
        setStatus("error");
        setErrorMessage(body.error.message);
        return;
      }
      const outcome = body as { result: DeckReviewResult };
      setReview(outcome.result);
      setIsStale(false);
      setStatus("idle");
    } catch {
      setStatus("error");
      setErrorMessage("Something went wrong generating the review. Please try again.");
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">AI Review</h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={status === "generating"}
          className="min-h-11 px-4 rounded-md bg-neutral-900 text-white text-sm font-medium disabled:opacity-50"
        >
          {status === "generating" ? "Reviewing…" : review ? "Regenerate review" : "Generate review"}
        </button>
      </div>

      {status === "loading" && <p className="text-sm text-neutral-400">Checking for an existing review…</p>}

      {status === "rate_limited" && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">{errorMessage}</p>
      )}
      {status === "error" && <p className="text-sm text-red-600">{errorMessage}</p>}

      {isStale && review && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
          This review was generated before your most recent changes — it may be outdated. Regenerate for an
          up-to-date review.
        </p>
      )}

      {!review && status === "idle" && (
        <p className="text-sm text-neutral-500">
          Generate a review for strategic feedback based on this deck&apos;s cards and text. This is not live
          tournament-meta analysis.
        </p>
      )}

      {review && (
        <div className="space-y-4">
          <p className="text-sm">{review.summary}</p>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full px-2.5 py-1 bg-neutral-100 text-neutral-600">
              Confidence: {review.confidence}
            </span>
          </div>

          {review.strengths.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-neutral-500 mb-1">Strengths</h3>
              <ul className="space-y-2">
                {review.strengths.map((s, i) => (
                  <li key={i} className="text-sm">
                    <p className="font-medium">{s.title}</p>
                    <p className="text-neutral-600">{s.explanation}</p>
                    {s.evidenceCardIds.length > 0 && (
                      <p className="text-xs mt-0.5">
                        {s.evidenceCardIds.map((id, j) => (
                          <span key={id}>
                            {j > 0 && ", "}
                            <CardRef id={id} knownCards={knownCards} />
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {review.issues.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-neutral-500 mb-1">Issues</h3>
              <ul className="space-y-2">
                {review.issues.map((issue, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs rounded-full px-2 py-0.5 ${SEVERITY_COLOR[issue.severity]}`}>
                        {issue.severity}
                      </span>
                      <p className="font-medium">{issue.title}</p>
                    </div>
                    <p className="text-neutral-600 mt-0.5">{issue.explanation}</p>
                    {issue.evidenceCardIds.length > 0 && (
                      <p className="text-xs mt-0.5">
                        {issue.evidenceCardIds.map((id, j) => (
                          <span key={id}>
                            {j > 0 && ", "}
                            <CardRef id={id} knownCards={knownCards} />
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {review.suggestedSwaps.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-neutral-500 mb-1">Suggested swaps</h3>
              <p className="text-xs text-neutral-400 mb-2">
                Optional — nothing here is applied automatically. Review each suggestion and apply it yourself if
                you agree.
              </p>
              <ul className="space-y-2">
                {review.suggestedSwaps.map((swap, i) => (
                  <li key={i} className="rounded-md border border-neutral-200 p-2 text-sm">
                    <p>
                      <span className="text-red-700">
                        −{swap.remove.map((r) => `${r.count}× ${knownCards[r.cardId]?.name ?? r.cardId}`).join(", ")}
                      </span>
                      {"  "}
                      <span className="text-green-700">
                        +{swap.add.map((a) => `${a.count}× ${knownCards[a.cardId]?.name ?? a.cardId}`).join(", ")}
                      </span>
                    </p>
                    <p className="text-neutral-600 mt-1">{swap.reason}</p>
                    <button
                      type="button"
                      onClick={() => onApplySwap(swap.remove, swap.add)}
                      className="min-h-11 mt-2 px-3 rounded-md border border-neutral-300 text-xs"
                    >
                      Apply this swap
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {review.limitations.length > 0 && (
            <p className="text-xs text-neutral-400 border-t border-neutral-200 pt-2">
              {review.limitations.join(" ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
