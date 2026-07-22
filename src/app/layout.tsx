import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TCG Deck Builder",
  description: "Build and review Pokémon TCG decks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-neutral-200 px-4 py-3 print:hidden">
          <Link href="/" className="font-semibold">
            TCG Deck Builder
          </Link>
        </header>
        <main className="flex-1 px-4 py-6 max-w-5xl mx-auto w-full print:p-0 print:max-w-none">{children}</main>
        <footer className="border-t border-neutral-200 px-4 py-4 text-sm text-neutral-500 print:hidden">
          <p>
            This is an unofficial Pokémon TCG deck-building tool. It is not
            produced, endorsed or supported by Nintendo, The Pokémon Company
            or Pokémon.
          </p>
        </footer>
      </body>
    </html>
  );
}
