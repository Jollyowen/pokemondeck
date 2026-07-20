import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Welcome</h1>
      <p className="text-neutral-600">
        Browse the card catalogue to get started. The deck builder and library
        are coming in the next phase.
      </p>
      <Link
        href="/cards"
        className="inline-block min-h-11 rounded-md bg-neutral-900 px-4 py-2.5 text-white text-sm font-medium"
      >
        Browse cards
      </Link>
    </div>
  );
}
