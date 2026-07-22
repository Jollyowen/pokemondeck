# Local Card Database — Brief

## 1. What this actually solves

Right now every search — the catalogue, the deck builder's search pane,
AI candidate gathering — hits the *external* Pokémon TCG API live, with
no fuzzy matching and real rate-limit exposure. That's the root cause
behind several things we've already worked around rather than fixed:
the earlier "search felt slow" reports, the gap that made dropdown
filters so important ("no fuzzy search" — your words), and the
tradeoff we just made gating the name field behind an explicit Search
press.

A local, periodically-synced mirror of the catalogue in our own Postgres
fixes the actual problem instead of working around it: local queries are
fast, have no rate limit, and Postgres gives us real fuzzy matching the
external API doesn't.

**Genuine payoff once this exists**: the name field could go back to
real-time-as-you-type, safely — the tradeoff that made us gate it in the
first place (hitting a slow, rate-limited third party on every keystroke)
goes away once "every keystroke" means a fast local query instead. Not
committing to that in this brief, but flagging it as a real option worth
revisiting once this lands.

## 2. Scope correction worth naming upfront

You mentioned skipping card images to keep the database lean — worth
knowing that images are already just lightweight URL strings pointing at
the provider's own CDN, not stored image files, so there's no real size
saved by excluding them (and we'd still want the URLs to actually show
card art). I'd read your actual intent as "don't bloat this with rarely-
needed detail," which is the right instinct — addressed below via a
split between indexed/searchable columns and a catch-all JSON column for
everything else.

## 3. Schema

A new `cards` table — not just an upgraded cache, a real local mirror,
replacing the current `card_cache` table entirely (see section 6 for why
merging rather than keeping both):

```sql
create table cards (
  id text primary key,              -- provider's card id, e.g. "sv9-41"
  name text not null,
  supertype text not null,          -- 'Pokémon' | 'Trainer' | 'Energy'
  subtypes text[] not null default '{}',
  types text[] not null default '{}',
  set_id text not null,
  set_name text not null,
  rarity text,
  hp integer,
  number text,
  evolves_from text,
  evolves_to text[] not null default '{}',
  legality_standard text not null default 'not_legal',
  legality_expanded text not null default 'not_legal',
  legality_unlimited text not null default 'not_legal',
  -- Everything else (attacks, abilities, weaknesses, resistances,
  -- retreat cost, rules text, price, image URLs) — not searched or
  -- filtered on directly, only needed once a specific card is actually
  -- opened/added/reviewed, so it doesn't need its own indexed column.
  details jsonb not null,
  synced_at timestamptz not null default now()
);

create extension if not exists pg_trgm;
create index cards_name_trgm_idx on cards using gin (name gin_trgm_ops);
create index cards_set_id_idx on cards (set_id);
create index cards_supertype_idx on cards (supertype);
create index cards_types_idx on cards using gin (types);
```

The `pg_trgm` extension + trigram index is what actually delivers fuzzy
matching — substring and typo-tolerant search on `name`, not just the
provider's prefix-ish matching we have today.

## 4. Sync mechanism

**Runs as a standalone script via a scheduled GitHub Actions workflow, not
a Vercel API route.** Reasoning: a full catalogue sync means paginating
through the entire card set (~80-100 requests at 250 cards/page) — likely
too slow for a single Vercel serverless function's execution limit,
especially on lower tiers. GitHub Actions jobs have a much more generous
time budget by default, and we already have precedent for a scheduled
workflow in this repo (`ci.yml`, even though that one's not
schedule-triggered).

- New file: `scripts/sync-cards.ts` — fetches every set, paginates through
  every card in each, upserts into the `cards` table. Reuses the existing
  provider adapter's `normalizeCard` mapping logic, not a second parser.
- New file: `.github/workflows/sync-cards.yml` — scheduled trigger
  (`cron`), runs the script with `POKEMON_TCG_API_KEY` and
  `SUPABASE_SERVICE_ROLE_KEY` supplied as GitHub Actions secrets (same
  values as Vercel's, entered separately — GitHub Actions can't read
  Vercel's env vars).
- **Never exposed as a public/authenticated app endpoint** — the sync only
  ever runs from the GitHub Actions runner directly against Supabase,
  which is a smaller attack surface than adding a new authenticated route
  to the running app.
- Full re-sync every run (upsert everything), not incremental. Simpler,
  self-healing if a previous run partially failed, and — with an API key
  — a sync every few days is a light enough load that incremental
  complexity isn't worth it.

## 5. What changes in the app

- `/api/cards` (search) and `/api/cards/[id]` (single lookup) query the
  local `cards` table instead of calling the live provider directly.
  Dramatically faster, no external rate limit, genuine fuzzy name search.
- If a specific card ID isn't found locally (e.g. added to the provider's
  catalogue in the last few days, before the next sync run), fall back to
  a live single-card fetch as a safety net — cheap insurance, and it's
  exactly the kind of gap a periodic sync will always have at the
  margins.
- The Pokémon-name autocomplete in the AI deck generator needs no code
  changes at all — it already calls `/api/cards`, so it inherits the
  speed and fuzzy-matching improvement automatically once the endpoint
  itself is backed by the local table.
- AI candidate gathering (`candidate-cards.ts`) also benefits automatically
  for the same reason — same underlying search path.

## 6. Retiring `card_cache`

The existing `card_cache` table (added in Phase 1, reactive — only
populated when a card happens to get searched or viewed) becomes
redundant once a comprehensive, proactively-synced `cards` table exists.
Keeping both would mean two overlapping "cached card data" tables with
different freshness guarantees — confusing, and a real source of subtle
bugs (we've already hit "search results and DB state disagree" issues
once in this project). Proposing to drop `card_cache` and its associated
code (`src/lib/cache/card-cache.ts`) entirely in favour of the new table,
rather than run them in parallel.

## 7. Open questions

1. **Sync frequency** — suggesting weekly as a starting point (new sets
   release roughly quarterly, so daily is unnecessary load; a few days
   feels about right too if you'd rather catch a new set faster). Your
   call.
2. **Revert the name field to real-time search once this lands?** The
   thing that made us gate it (hitting a slow, rate-limited external API
   per keystroke) goes away once search is local. Not doing this as part
   of this change automatically — want your explicit call once the local
   mirror is actually live and you've felt how fast it is.
3. You'll need to add two GitHub Actions secrets to the repo
   (`POKEMON_TCG_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — same values
   already in Vercel, just re-entered in GitHub's own secrets UI, since
   the two platforms don't share secrets automatically. Fine to walk you
   through this when we get there.
