import type { Card, DeckFormat } from "@/types/card";
import type { DeckCardEntry } from "@/types/deck";
import { isCardLegalInFormat } from "@/lib/format-legality";

const GROUP_ORDER: Array<Card["supertype"]> = ["Pokémon", "Trainer", "Energy"];

export function ReadOnlyDeckCardList({
  entries,
  cardsById,
  format,
}: {
  entries: DeckCardEntry[];
  cardsById: Record<string, Card>;
  format: DeckFormat;
}) {
  const groups = GROUP_ORDER.map((supertype) => ({
    supertype,
    entries: entries
      .filter((e) => cardsById[e.cardId]?.supertype === supertype)
      .sort((a, b) => a.cardName.localeCompare(b.cardName)),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.supertype}>
          <h3 className="text-sm font-semibold text-ink-secondary mb-2">
            {group.supertype} ({group.entries.reduce((s, e) => s + e.quantity, 0)})
          </h3>
          <ul className="space-y-1">
            {group.entries.map((entry) => {
              const card = cardsById[entry.cardId];
              const legal = card ? isCardLegalInFormat(card, format) : true;
              return (
                <li
                  key={entry.cardId}
                  className={`flex items-center gap-2 rounded-md border border-line px-2 py-1.5 ${
                    legal ? "" : "bg-warning-bg"
                  }`}
                >
                  <span className="flex-1 text-sm truncate">{entry.cardName}</span>
                  {!legal && <span className="text-xs text-warning-text whitespace-nowrap">Illegal</span>}
                  <span className="text-sm tabular-nums text-ink-secondary">×{entry.quantity}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
