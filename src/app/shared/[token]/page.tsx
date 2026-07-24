import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSharedDeckByToken } from "@/lib/deck/repository";
import { resolveDeckCards } from "@/lib/deck/resolve-cards";
import { computeDeckValidation } from "@/lib/deck/validate";
import { computeDeckStatistics } from "@/lib/deck/statistics";
import { ReadOnlyDeckCardList } from "@/components/decks/ReadOnlyDeckCardList";
import { DeckStatisticsPanel } from "@/components/decks/DeckStatisticsPanel";
import { CopySharedDeckButton } from "@/components/decks/CopySharedDeckButton";
import type { DeckStatus } from "@/types/deck";

// Shared decks must never be indexed by search engines.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<DeckStatus, string> = {
  draft: "Draft",
  complete: "Complete",
  format_legal: "Format legal",
};

const STATUS_COLOR: Record<DeckStatus, string> = {
  draft: "bg-surface-muted-2 text-ink-secondary",
  complete: "bg-info-bg text-info-text",
  format_legal: "bg-success-bg text-success-text",
};

export default async function SharedDeckPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Re-checked on every request against share_enabled/deleted_at, so a
  // revoked or deleted deck stops resolving immediately — there's no
  // separate cache of "this link used to work" anywhere.
  const deck = await getSharedDeckByToken(token);
  if (!deck) notFound();

  const { cardsById, missingCardIds } = await resolveDeckCards(deck.cards);
  const validation = computeDeckValidation(deck.cards, cardsById, missingCardIds, deck.format);
  const statistics = computeDeckStatistics(deck.cards, cardsById, deck.format);
  const totalCount = deck.cards.reduce((s, e) => s + e.quantity, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-ink-muted mb-1">Shared deck (read-only)</p>
        <h1 className="text-2xl font-semibold">{deck.name}</h1>
        {(deck.strategyArchetype || deck.strategyNotes) && (
          <p className="text-sm text-ink-secondary mt-1">
            {deck.strategyArchetype && (
              <span className="capitalize">
                {deck.strategyArchetype === "aggro"
                  ? "Aggro / Beatdown"
                  : deck.strategyArchetype === "control"
                    ? "Control / Stall"
                    : deck.strategyArchetype === "mill"
                      ? "Mill"
                      : "Other"}
              </span>
            )}
            {deck.strategyArchetype && deck.strategyNotes && " — "}
            {deck.strategyNotes}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`text-xs rounded-full px-2.5 py-1 ${STATUS_COLOR[deck.status]}`}>
            {STATUS_LABEL[deck.status]}
          </span>
          <span className="text-sm text-ink-secondary capitalize">
            {deck.format === "all" ? "All formats" : deck.format}
          </span>
          <span className="text-sm text-ink-secondary">{totalCount} / 60 cards</span>
        </div>
      </div>

      <CopySharedDeckButton shareToken={token} />

      {validation.issues.length > 0 && (
        <ul className="text-sm space-y-1 rounded-md border border-line p-3">
          {validation.issues.map((issue, i) => (
            <li key={i} className={issue.severity === "error" ? "text-danger-text" : "text-ink-secondary"}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      <div>
        <h2 className="font-medium mb-2">Deck</h2>
        <ReadOnlyDeckCardList entries={deck.cards} cardsById={cardsById} format={deck.format} />
      </div>

      <section className="rounded-lg border border-line p-4">
        <h2 className="font-medium mb-3">Statistics</h2>
        <DeckStatisticsPanel stats={statistics} />
      </section>
    </div>
  );
}
