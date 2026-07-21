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

function CardChip({
  id,
  knownCards,
  onPreviewCard,
}: {
  id: string;
  knownCards: Record<string, Card>;
  onPreviewCard: (card: Card) => void;
}) {
  const card = knownCards[id];
  if (!card) return <span className="text-neutral-500">{id}</span>;
  return (
    <button
      type="button"
      onClick={() => onPreviewCard(card)}
      className="inline-flex items-center gap-1 text-neutral-600 hover:underline"
    >
      {card.imageSmall && (
        // eslint-disable-next-line @next/next/no-img-element -- external, dynamic provider image, small inline chip
        <img src={card.imageSmall} alt="" className="w-4 h-auto rounded-sm" />
      )}
      {card.name}
    </button>
  );
}

function SwapCardGroup({
  cards,
  knownCards,
  onPreviewCard,
  sign,
}: {
  cards: Array<{ cardId: string; count: number }>;
  knownCards: Record<string, Card>;
  onPreviewCard: (card: Card) => void;
  sign: "remove" | "add";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {cards.map((ref) => {
        const card = knownCards[ref.cardId];
        return (
          <button
            key={ref.cardId}
            type="button"
            onClick={() => card && onPreviewCard(card)}
            className="flex items-center gap-2 text-left"
          >
            {card?.imageSmall ? (
              // eslint-disable-next-line @next/next/no-img-element -- external, dynamic provider image
              <img src={card.imageSmall} alt="" className="w-10 rounded-sm shrink-0" />
            ) : (
              <div className="w-10 aspect-[63/88] shrink-0 rounded-sm bg-neutral-100" />
            )}
            <span className="text-xs">
              <span className={sign === "remove" ? "text-red-700" : "text-green-700"}>
                {sign === "remove" ? "−" : "+"}
                {ref.count}×
              </span>{" "}
              {card?.name ?? ref.cardId}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DeckReviewPanel({
  deckId,
  knownCards,
  onApplySwap,
  onPreviewCard,
  onResolvedCards,
}: {
  deckId: string;
  knownCards: Record<string, Card>;
  onApplySwap: (remove: Array<{ cardId: string; count: number }>, add: Array<{ cardId: string; count: number }>) => void;
  onPreviewCard: (card: Card) => void;
  onResolvedCards: (cards: Record<string, Card>) => void;
}) {
  const [review, setReview] = useState<DeckReviewResult | null>(null);
  const [appliedSwapIndices, setAppliedSwapIndices] = useState<Set<number>>(new Set());
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
        const outcome = body.review as {
          review: { result: DeckReviewResult };
          resolvedCards: Record<string, Card>;
          isStale: boolean;
        } | null;
        if (outcome) {
          setReview(outcome.review.result);
          setAppliedSwapIndices(new Set());
          setIsStale(outcome.isStale);
          onResolvedCards(outcome.resolvedCards);
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
      const outcome = body as { result: DeckReviewResult; resolvedCards: Record<string, Card> };
      setReview(outcome.result);
      setAppliedSwapIndices(new Set());
      setIsStale(false);
      onResolvedCards(outcome.resolvedCards);
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
        <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2" role="alert">
          {errorMessage}
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {errorMessage}
        </p>
      )}

      {isStale && review && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2" role="status">
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
                      <p className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        {s.evidenceCardIds.map((id) => (
                          <CardChip key={id} id={id} knownCards={knownCards} onPreviewCard={onPreviewCard} />
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
                      <p className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        {issue.evidenceCardIds.map((id) => (
                          <CardChip key={id} id={id} knownCards={knownCards} onPreviewCard={onPreviewCard} />
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
              <ul className="space-y-3">
                {review.suggestedSwaps.map((swap, i) => (
                  <li key={i} className="rounded-md border border-neutral-200 p-3">
                    <div className="flex items-center gap-3">
                      <SwapCardGroup
                        cards={swap.remove}
                        knownCards={knownCards}
                        onPreviewCard={onPreviewCard}
                        sign="remove"
                      />
                      <span className="text-neutral-300 text-lg shrink-0">→</span>
                      <SwapCardGroup
                        cards={swap.add}
                        knownCards={knownCards}
                        onPreviewCard={onPreviewCard}
                        sign="add"
                      />
                    </div>
                    <p className="text-sm text-neutral-600 mt-2">{swap.reason}</p>
                    <button
                      type="button"
                      disabled={appliedSwapIndices.has(i)}
                      onClick={() => {
                        onApplySwap(swap.remove, swap.add);
                        setAppliedSwapIndices((prev) => new Set(prev).add(i));
                      }}
                      className="min-h-11 mt-2 px-3 rounded-md border border-neutral-300 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {appliedSwapIndices.has(i) ? "Applied ✓" : "Apply this swap"}
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
