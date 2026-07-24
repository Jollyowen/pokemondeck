# UI Styling & Visual Polish — Brief

## 0. Grounded in the actual repo, not the project docs

Read the shipped code directly rather than the `DECISIONS.md`/brief copies
under `/mnt/project` — same lesson the "code audit" entry already learned:
those were ~600 lines behind the version in this zip (missing the whole
TCGdex migration and three UI/UX redesign batches). Everything below is
based on what's actually in `src/`.

Worth naming up front: three of the four areas we agreed to prioritize are
**partly already done** by the UI/UX redesign batches and the code audit.
This brief only proposes what's still genuinely open, not a redo of
settled work.

## 1. Foundation check (this determines a lot of what follows)

- **Tailwind CSS 3.4**, default config — `theme.extend.colors` only
  defines `background`/`foreground` (mapped to two CSS custom properties
  in `globals.css`). No design-token system beyond that.
- **No `darkMode` key set** in `tailwind.config.ts` — dark mode is
  completely greenfield, not partially built.
- **No component/chart/icon library** — no shadcn, no recharts/chart.js,
  no lucide. Every bar, badge, and panel so far is hand-rolled Tailwind +
  plain `<div>`s. `DeckStatisticsPanel` already does this reasonably well
  (CSS-width bar charts, no library needed) — worth continuing that
  pattern rather than introducing a charting dependency for this.
- **299 raw color-utility occurrences across 26 files**
  (`bg-neutral-100`, `text-red-700`, `border-amber-200`, etc.), all literal
  Tailwind classes, not tokens. This is the number that makes dark mode
  the expensive item in this brief, not the others — see §5.
- **Existing energy-type icon set** (`public/energy-icons/*.png`,
  `EnergyTypeIcon`/`EnergyTypeStack`) is already the app's established
  visual language for Pokémon types, used on deck-stack thumbnails and
  the card overlay. Already flagged once as resembling official TCG
  symbols — that was your call on your own uploaded assets, not something
  this brief revisits. Everything below reuses those existing components
  as-is; nothing here proposes new Pokémon-branded artwork.

## 2. Area 1 — Deck quality & data, visualized

### Current state
`DeckQualityPanel` renders **only the checks that failed**, as flat text:

```tsx
// DeckQualityPanel.tsx, today
const hardIssues = quality.issues.filter(i => i.severity === "hard");
const softIssues = quality.issues.filter(i => i.severity === "soft");
// ...then just <li>{issue.message}</li> for each
```

`computeDeckQuality` (`deck-quality.ts`) only ever pushes an `issue` when a
check *fails* — a passing check produces nothing. There's no way for the
UI to show "11/11 checks passed" or "8/11," only "here are your 3
problems." `DeckStatisticsPanel` is in better shape — it already has
CSS-bar distributions for type/evolution/energy-cost — but shows raw
counts with no reference to the archetype's target range that
`archetype-profiles.ts` already computes elsewhere.

### Proposed change (this is the one area needing a logic/type change, not just markup)

Extend `DeckQualityResult` to carry the full checklist, not just failures:

```ts
export type DeckQualityCheck = {
  code: DeckQualityIssueCode;
  severity: "hard" | "soft";
  passed: boolean;
  label: string;              // short, e.g. "Pokémon count"
  message: string;            // existing detail text, shown on failure/expand
  actual?: number;            // e.g. 18
  target?: [number, number] | number; // range or minimum
};

export type DeckQualityResult = {
  issues: DeckQualityIssue[];   // unchanged — still what feeds the AI refinement prompt
  checks: DeckQualityCheck[];   // new — all 11, pass and fail alike
  passesHardChecks: boolean;
};
```

`issues` stays exactly as-is (it's load-bearing for the refinement-pass
trigger and Prompt C's feedback text — no reason to touch that path).
`checks` is additive, computed alongside each existing push, so this is a
low-risk extension rather than a rewrite of the scoring logic itself.

**New `DeckQualityPanel`**: an 11-cell chip grid, one per check —
green check / amber flag / red fail — each showing `label` and, where
available, `actual` vs `target` (e.g. "Pokémon: 18 / 14–18"). Tap or click
a chip to expand its full `message` text, rather than always showing the
whole prose block. Passing checks collapse to a small green chip instead
of vanishing entirely, so "why does this look fine" is answerable at a
glance instead of only "what's wrong."

**`DeckStatisticsPanel`**: fold the same `archetype-profiles.ts` ranges in
next to the existing Pokémon/Trainer/Energy counts (already computed
elsewhere in the codebase, just not passed to this component yet), and
color each composition bar green/amber based on in-range vs. out. Swap
the type-distribution bars' plain text labels for the existing
`EnergyTypeIcon` next to each row — visually consistent with how the deck
stack thumbnail and card overlay already show type.

This also sets up the manual composition override (redesign brief §5b,
still unbuilt) cleanly: once it exists, "target" becomes the override
value with its ±2 tolerance instead of the archetype range, and the same
bar component just renders a different target — no new UI needed then.

## 3. Area 2 — Pokémon-TCG visual polish

Most of what "visual polish" would normally mean here already
shipped in the three UI/UX redesign batches: deck-stack thumbnails,
evolution-line grouping, Trainer subtype splitting, the card overlay's
set/type info, deck cost on the library view. What's genuinely still
plain:

- **The type-distribution bars in `DeckStatisticsPanel`** — covered above
  in §2, so not duplicated here.
- **`CardBrowser`'s pre-search state** — literally just centered text
  ("Search or filter to see cards"). It's the one spot in the app with
  zero visual element; everything around it (skeleton loading, error
  state, the degraded-API banner) is already handled well. Modest fix:
  a muted type-icon motif or a small row of a few recently-synced cards,
  not a redesign — this is a small gap, not a big one, and I don't want
  to oversell it.
- Checked `CardTile` for hover/focus states while I was in there —
  already has a proper focus ring and hover border change, nothing to
  add.

## 4. Area 3 — Modal & interaction polish

`CardImageModal` currently has Close/Escape/click-outside and correct
focus management (confirmed — Phase 8's accessibility pass already fixed
focus trapping and restore-on-close), but **no next/prev navigation**. It
takes a single `card` prop with no awareness of what list it came from.

Proposed: an optional `cards: Card[]` + `currentIndex: number` pair passed
in from contexts that have an ordered list (search results, the deck
list) — left/right arrow keys plus on-screen buttons step through it,
wrapping the same focus-management logic already in place. Contexts with
only a single card in view (e.g. a swap suggestion's before/after pair)
simply don't pass the list prop, so no navigation UI renders there —
correctly scoped rather than showing dead arrows where there's nothing to
step through.

## 5. Area 4 — Dark mode

The big one. Two real implementation paths, worth deciding explicitly
rather than defaulting into one:

**Option A — semantic tokens.** Extend the existing CSS-variable pattern
(`--background`/`--foreground` already exist) into a fuller set
(`--surface`, `--surface-muted`, `--border`, `--text-muted`,
`--danger-bg`/`--danger-text`, `--success-bg`/`--success-text`,
`--warning-bg`/`--warning-text`), mapped into `tailwind.config.ts` as
named colors, toggled via `darkMode: "class"` and a `.dark` class on
`<html>` that overrides the variables. Every one of the 299 raw-color
occurrences gets swapped for the semantic name (`bg-neutral-50` →
`bg-surface-muted`, etc.) — mechanical, file-by-file, but touches all 26
files once.

**Option B — bolt-on `dark:` variants.** Leave every existing class alone
and add a `dark:` counterpart next to it (`bg-neutral-50
dark:bg-neutral-800`). Zero architectural change, works immediately, but
every future component now needs its author to remember both a light and
a dark shade for every color decision, forever — colors defined in two
places with no single source of truth. This is the same shape of problem
this project already talked itself out of once (`card_cache` running
alongside the new local `cards` table) — two overlapping sources of the
same information, prone to drifting out of sync.

**My recommendation is A**, on the strength of that precedent, but it's
genuinely more upfront work (touches all 26 files, once) for a purely
aesthetic payoff, so I'd rather you make this call explicitly than have
me pick it silently — see open questions below.

Either way:
- **Toggle** lives in the header next to the "TCG Deck Builder" link.
  Suggest a three-way light/dark/system control, defaulting to
  `prefers-color-scheme` until someone explicitly picks one, then
  persisting the explicit choice — a real production web app, so
  `localStorage` is the right tool here (unlike a Claude-artifact
  context, this isn't restricted).
- **No flash of the wrong theme on load**: needs a small blocking inline
  script in `<head>` that reads the stored preference before first paint,
  the standard pattern for this in Next.js — a pure-React/`useEffect`
  approach alone will flash light-then-dark on every load.
- **Print stays untouched.** `globals.css` already has a `@media print`
  block forcing A4/margins; dark surfaces must never bleed into the
  printed decklist regardless of the active theme — same override
  mechanism already established there, just needs the print block to
  keep forcing light/print-safe colors explicitly.

## 6. Suggested build order

1. Deck quality panel + stats polish (§2) — self-contained, extends an
   existing pattern, no architectural risk.
2. Modal navigation (§4) — small, isolated, no dependency on the others.
3. Remaining visual polish touches (§3).
4. Dark mode (§5) last, deliberately — it's the most cross-cutting change,
   and doing it last means it only has to theme the *final* set of
   components once (including the new quality chips and stat bars from
   step 1) rather than needing a second pass after they land.

## 7. Decisions from your answers

- **Dark mode: Option A (semantic tokens), confirmed.** Proceeding with
  the CSS-variable/Tailwind-token approach in §5, touching all 26 files
  once rather than bolting `dark:` variants onto the existing classes.
- **Theme toggle: two-way (light/dark), confirmed.** Simpler than the
  three-way light/dark/system control originally proposed — no need to
  read `prefers-color-scheme` as a default state at all; the toggle just
  persists whichever of the two the person picked, via `localStorage`.
- **Quality panel: collapse-by-default, expand on request, confirmed.**
  Passing checks (and likely the full checklist generally) render as a
  compact summary — something like "9/11 checks passed" — with the full
  11-chip grid available on tap/click, rather than always showing all 11
  chips at once.

## 8. Open question

1. **`CardBrowser` pre-search state (§3)** — see the mockup below; still
   deciding whether either option is worth building, or whether to leave
   this one alone.

Status: draft — one open item above before implementation starts.
