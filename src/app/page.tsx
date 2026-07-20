import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Welcome</h1>
      <p className="text-neutral-600">
        Browse the card catalogue to get started, or jump straight into
        building a deck.
      </p>
      <div className="flex gap-3">
        <Link
          href="/cards"
          className="inline-block min-h-11 rounded-md bg-neutral-900 px-4 py-2.5 text-white text-sm font-medium"
        >
          Browse cards
        </Link>
        <Link
          href="/decks/new"
          className="inline-block min-h-11 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium"
        >
          New deck
        </Link>
      </div>
    </div>
  );
}
