import Link from "next/link";
import { redirect } from "next/navigation";
import { getOwnerId } from "@/lib/owner";
import { hasAnyOwnedDecks } from "@/lib/deck/repository";
import { CardBrowser } from "@/components/cards/CardBrowser";

export default async function HomePage() {
  // Read-only: Next.js doesn't allow setting cookies during a Server
  // Component render, so this never creates the owner cookie itself — a
  // first-time visitor with no cookie yet also has no decks, so the
  // distinction doesn't matter here. The cookie gets created for real the
  // first time a deck is actually saved (a Route Handler, where it's safe).
  const ownerId = await getOwnerId();
  const hasDecks = ownerId ? await hasAnyOwnedDecks(ownerId) : false;

  // Once at least one deck exists, the deck library becomes the default
  // landing screen, per the deck-library requirement.
  if (hasDecks) {
    redirect("/decks");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Welcome</h1>
      <p className="text-ink-secondary">
        Browse the card catalogue to get started, or jump straight into
        building a deck.
      </p>
      <div className="flex gap-3">
        <Link
          href="/cards"
          className="inline-block min-h-11 rounded-md bg-primary px-4 py-2.5 text-primary-foreground text-sm font-medium"
        >
          Browse cards
        </Link>
        <Link
          href="/decks/new"
          className="inline-block min-h-11 rounded-md border border-line-strong px-4 py-2.5 text-sm font-medium"
        >
          New deck
        </Link>
      </div>

      <div className="pt-4 border-t border-line">
        <CardBrowser heading="Search cards" />
      </div>
    </div>
  );
}
