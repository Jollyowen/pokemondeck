"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";

function SunIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

/**
 * Two-way light/dark toggle, confirmed over a three-way
 * light/dark/system control — no `prefers-color-scheme` fallback, the
 * app simply defaults to light until someone explicitly picks dark.
 * Persists via localStorage (a real app, not a Claude-artifact context,
 * so this is the right tool). The no-flash-on-load read of that same
 * key lives in a `beforeInteractive` script in layout.tsx, not here —
 * this component only needs to reflect and toggle the state already set
 * on <html> by the time it mounts.
 */
export function ThemeToggle() {
  // Starts unknown so we render nothing meaningful until we can read the
  // real state client-side — the blocking script in layout.tsx already
  // set the right class on <html> before this ever mounts, so this is
  // just catching up to it, not deciding the initial theme itself.
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // localStorage can throw (private browsing, disabled storage) —
      // the toggle still works for the session, it just won't persist.
    }
    setIsDark(next);
  }

  if (isDark === null) {
    // Placeholder keeps layout stable during the brief window before
    // mount; not interactive yet since we don't know the real state.
    return <span className="inline-block min-h-11 min-w-11" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md border border-line-strong text-ink-secondary hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-line-stronger"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
