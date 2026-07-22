/**
 * Renders a deck as a stack of cards: the deck's chosen main Pokémon on
 * top, with two plain card-backs peeking out underneath to suggest a full
 * stack. The cards underneath are purely decorative (fixed offsets, no
 * data), per the brief — only the top card is ever real.
 */
export function DeckStackThumbnail({ imageSmall, deckName }: { imageSmall: string | null; deckName: string }) {
  return (
    <div className="relative w-full aspect-[5/7] max-w-[140px] mx-auto" aria-hidden={imageSmall ? undefined : "true"}>
      {/* Back-most decorative card */}
      <div className="absolute inset-0 translate-x-2 translate-y-3 rotate-6 rounded-lg border border-neutral-300 bg-neutral-100 shadow-sm" />
      {/* Middle decorative card */}
      <div className="absolute inset-0 translate-x-1 translate-y-1.5 rotate-3 rounded-lg border border-neutral-300 bg-neutral-50 shadow-sm" />
      {/* Top card — the real, user-chosen main Pokémon */}
      <div className="absolute inset-0 rounded-lg border border-neutral-300 bg-white shadow-md overflow-hidden flex items-center justify-center">
        {imageSmall ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageSmall} alt={`${deckName} — featured card`} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-neutral-400 text-center px-2">No main Pokémon set</span>
        )}
      </div>
    </div>
  );
}
