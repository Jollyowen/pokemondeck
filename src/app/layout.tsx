import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "TCG Deck Builder",
  description: "Build and review Pokémon TCG decks.",
};

// Runs before hydration so the correct theme class is already on <html>
// by first paint — a plain useEffect in ThemeToggle would flash light
// then dark on every load. Two-way only: no localStorage value means
// "stay light," not "check prefers-color-scheme," matching the
// confirmed two-way (not system-following) toggle design.
const THEME_INIT_SCRIPT = `
try {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <header className="border-b border-line px-4 py-3 print:hidden flex items-center justify-between">
          <Link href="/" className="font-semibold">
            TCG Deck Builder
          </Link>
          <ThemeToggle />
        </header>
        <main className="flex-1 px-4 py-6 max-w-5xl mx-auto w-full print:p-0 print:max-w-none">{children}</main>
        <footer className="border-t border-line px-4 py-4 text-sm text-ink-secondary print:hidden">
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
