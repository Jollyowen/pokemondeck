# Pokémon TCG Deck Builder

Unofficial Pokémon TCG deck-building tool with AI-assisted deck review. Not
produced, endorsed or supported by Nintendo, The Pokémon Company or Pokémon.

Build status: **Phase 8 of 8 complete** — all phases from the build brief
are implemented, plus a post-brief addition: AI-assisted deck generation
("AI assist" on the New Deck page — describe a Pokémon and style of play,
get a verified starting 60-card deck) via a plan → compile → score → refine
pipeline with archetype-specific quality checks (see
`ai-deck-assist-redesign-brief.md` for the full redesign brief), and a
locally-synced card database replacing live-API search entirely (see
`local-card-database-brief.md`), and a UI/UX redesign covering searchable
landing page, card-stack deck thumbnails, evolution-line/Trainer-subtype
grouping in the deck editor, richer card-image overlays, and a print-deck
view (list page + full-art A4 sheets). See
`pokemon-tcg-deck-builder-build-brief.md` for the full build brief and
phase plan, and `DECISIONS.md` for every deliberate implementation
decision and deviation made along the way.

## Stack

Next.js (TypeScript, App Router) · React · Tailwind CSS · Supabase Postgres ·
Zod · Vitest · Playwright · Anthropic/OpenAI (AI review)

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template and fill in real values:
   ```bash
   cp .env.example .env.local
   ```
   Every required variable is documented inline in `.env.example`. A
   missing or invalid value throws a single, clear error listing every
   problem when the server starts (see `src/lib/env.ts`) — it will not
   fail silently or partway through a request.
3. Create a Supabase project and run **every** migration in
   `supabase/migrations/` **in order** (`0001` through `0010` as of this
   writing), either via the Supabase CLI (`supabase db push`) or by
   pasting each file into the SQL editor one at a time, in numeric order.
   Skipping one is the single most common source of "column not found" or
   "row violates row-level security policy" errors — see Troubleshooting
   below. (`0010` adds the local `cards`/`sets` tables that now back all
   card search, and drops the older `card_cache` table entirely.)
4. Enable **Row Level Security** on every table (`owners`, `decks`,
   `deck_cards`, `deck_reviews`, `ai_deck_generations`, `cards`, `sets`),
   with **no policies added**.
   The app always talks to Supabase using the service-role key from a
   server-only context, which bypasses RLS entirely — RLS's job here is
   purely to lock the public anon-key API path shut, since that key ends
   up in the browser. Run this once, for all tables at once:
   ```sql
   alter table owners enable row level security;
   alter table decks enable row level security;
   alter table deck_cards enable row level security;
   alter table deck_reviews enable row level security;
   alter table ai_deck_generations enable row level security;
   alter table cards enable row level security;
   alter table sets enable row level security;
   ```
5. Get a free Pokémon TCG API key from https://dev.pokemontcg.io and set
   `POKEMON_TCG_API_KEY`.
6. Set `AI_PROVIDER` (`anthropic` or `openai`), `AI_MODEL`, and the
   matching API key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`).

## Running locally

```bash
npm run dev
```

Visit http://localhost:3000.

## Tests

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # Vitest unit tests
npm run test:e2e    # Playwright end-to-end tests (auto-starts a dev server)
```

Playwright needs its browser binary installed once per machine:
```bash
npx playwright install --with-deps chromium
```

CI (`.github/workflows/ci.yml`) runs all four on every push and pull
request to `main`, using placeholder (non-secret) environment values —
most e2e tests mock API responses at the network level and never reach a
real Supabase project, Pokémon TCG API, or AI provider.

## Production deployment (Vercel + Supabase)

1. **Push the repository to GitHub** and connect it to a new Vercel
   project (Vercel auto-detects Next.js — no `vercel.json` needed).
2. **Set up Supabase** as in steps 3–4 of Local setup above, using a
   dedicated Supabase project for production.
3. **Get your Supabase keys**: Project Settings → API Keys.
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe to expose
     in the browser by design)
   - **Secret** key → `SUPABASE_SERVICE_ROLE_KEY` (never expose this one —
     see Troubleshooting for what goes wrong if these two get swapped)
4. **Add every variable from `.env.example`** to Vercel → Settings →
   Environment Variables, for all environments (Production/Preview/
   Development) unless you specifically want them to differ.
5. Set `NEXT_PUBLIC_APP_URL` to your **stable production URL**
   (`https://your-project.vercel.app` or a custom domain) — **not** a
   per-deployment preview URL. This value gets baked into every share link
   and QR code generated by the app; if it points at a preview URL that
   later disappears, previously generated share links and QR codes stop
   resolving.
6. Redeploy after adding/changing environment variables — they only take
   effect on the next build, not retroactively.
7. **Always test against the stable production URL**, not a preview URL.
   The app's "anonymous owner" identity is a cookie scoped to whatever
   host you're on; testing from a different preview URL each deploy looks
   like a brand-new visitor every time, even though your previous decks
   are sitting safely in the database under the old cookie's identity.

### When a phase adds a new database migration or dependency

Check `DECISIONS.md` for the phase you're deploying — it calls out
whenever a migration or a `package.json` change was introduced. In
general:
- New migration → run it in the Supabase SQL editor before or right after
  deploying the corresponding code; the app will throw column-not-found
  errors otherwise.
- New dependency → make sure both `package.json` **and** `package-lock.json`
  are committed and pushed, not just the source files that use it (see
  Troubleshooting — a stale lockfile is a common cause of "module not
  found" during a Vercel build even when `package.json` looks correct).

## Local card database + sync

Card search, browsing, and AI candidate gathering all read from a local
mirror of the Pokémon TCG catalogue (`cards` and `sets` tables), not the
external API directly — fast, no external rate limit, and genuine
substring/fuzzy name search via a Postgres trigram index that the live
API alone doesn't give us. This mirror is kept current by a **standalone
script** (`scripts/sync-cards.ts`, run via `npm run sync-cards`), scheduled
weekly through `.github/workflows/sync-cards.yml` — deliberately run from
GitHub Actions rather than as a Vercel API route, since a full catalogue
sync (every set, every card) is too slow for a typical serverless
function's execution limit, and GitHub Actions jobs have a much more
generous time budget by default.

**Setup — three GitHub Actions secrets, separate from Vercel's env vars.**
GitHub Actions has its own secret store; it can't read Vercel's
environment variables, so the same values need entering a second time.
Go to your repo on GitHub → **Settings** (the repo's own settings tab, not
your account's) → **Secrets and variables** → **Actions** → **New
repository secret**, and add all three, using the same values already in
Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POKEMON_TCG_API_KEY`

These are encrypted, redacted from workflow logs automatically, and never
appear in any committed file — this is the whole reason to use GitHub's
secret store instead of, say, a checked-in `.env` file.

**Important: the local tables start empty.** Nothing populates `cards`/
`sets` until a sync actually runs — right after first deploying this
feature (or on a fresh Supabase project), the catalogue will show zero
results until then. Trigger the first sync manually rather than wait for
the weekly schedule: GitHub → your repo → **Actions** tab → **Sync card
database** workflow → **Run workflow**. A full sync takes roughly 8-12
minutes — deliberately paced to stay under the Pokémon TCG API's
30-requests-per-minute limit (a real constraint hit and fixed early on;
see `DECISIONS.md` if you're curious), not something wrong if it doesn't
finish instantly. Check the workflow's logs for progress.

## Project structure

```
src/
  app/              Next.js App Router pages and API routes
  lib/
    env.ts          Validated environment configuration (single source of truth)
    supabase/       Server (service role) and browser (anon key) clients
    deck/           Deck domain logic: validation, statistics, sharing, repository
    ai/             AI review + generation pipeline: prompts, providers, verification
    cards/          Local card database: row<->Card mapping, search/lookup/upsert
    providers/      Pokémon TCG API adapter — pokemon-tcg-api-core.ts (no server-only
                     guard, used by both the app and the standalone sync script) plus
                     pokemon-tcg-api.ts (server-only-guarded app singleton)
    monitoring/     Central error-reporting hook
  types/            Shared TypeScript types (Card, Deck, API)
  schemas/          Zod request validation schemas
  components/       React components, grouped by feature (cards/, decks/)
scripts/
  sync-cards.ts     Standalone catalogue sync — see "Local card database + sync" above
supabase/
  migrations/       Ordered SQL migrations — run every one, in order
tests/
  unit/             Vitest unit tests (pure logic — no network, no database)
  e2e/              Playwright end-to-end tests (mocked API responses)
  fixtures/         Shared fixture data for e2e tests
  mocks/            Test-environment stand-ins (e.g. server-only no-op)
.github/workflows/  CI pipeline
```

## Testing scope and known limitations

Per the build brief's required test list, most validation, AI-safety, and
statistics logic is pure and directly unit-tested — including deck-size
boundaries, copy-limit rules, the AI swap-verification pipeline, share
token entropy, provider selection, and rejection of malformed AI output.

A few required tests are inherently database-integration tests — "an owner
cannot read another owner's deck," "revoking sharing invalidates the URL,"
"deleting a deck invalidates the share URL," "a cached review is reused for
an unchanged deck" — and are **not** covered by an automated test in this
repository. Properly verifying these needs either a live Supabase test
project wired into CI, or extensive mocking of Supabase's chainable query
builder; the latter is brittle enough (mocking `.from().select().eq()...`
chains realistically) that it risks testing the mock rather than the
behaviour. Each of these is nonetheless enforced structurally in the code
(e.g. every owner-scoped repository function filters `.eq("owner_id",
ownerId)`; `getSharedDeckByToken` filters `share_enabled = true` and
`deleted_at is null` on every call, so there's no separate cache to
invalidate). See `DECISIONS.md` for the specific reasoning per case. If you
want to close this gap, a Supabase local dev instance (`supabase start`)
wired into the CI job as a service container is the natural next step.

## Troubleshooting

Real issues hit while building and deploying this app, in the order you're
likely to encounter them:

- **"Invalid or missing environment variables" on startup** — the error
  lists every missing/invalid variable at once. Check `.env.local` (local)
  or Vercel's Environment Variables (production) against `.env.example`.

- **`new row violates row-level security policy for table "..."`** —
  `SUPABASE_SERVICE_ROLE_KEY` is set to the wrong kind of key (most often
  the *publishable/anon* key by mistake). The service-role/secret key is
  specifically designed to bypass RLS; if requests are being blocked by
  RLS, the app isn't actually using it. Double-check Supabase → Settings →
  API Keys → **Secret keys** (separate from the Publishable key section)
  and make sure that exact value is what's in
  `SUPABASE_SERVICE_ROLE_KEY`.

- **`Could not find the '...' column of '...' in the schema cache`** — a
  migration hasn't been run against this Supabase project yet. Check
  Table Editor for the table in question and compare its columns against
  the corresponding `supabase/migrations/000N_*.sql` file; run whichever
  migration(s) are missing, in order. Do not re-run earlier migrations
  that already succeeded — they are not written to be idempotent and will
  error on a second run (e.g. "table already exists").

- **Vercel build fails with `Module not found: Can't resolve '@some/package'`**
  even though it's in `package.json` — the committed `package-lock.json`
  predates that dependency, so Vercel's `npm install` treats the lockfile
  as authoritative and never looks for the new package. Fix: make sure
  `package-lock.json` is regenerated (a plain local `npm install` does
  this) and committed alongside `package.json`, not just the source files
  that import the new package.

- **Vercel build fails with an ESLint error about `<a>` vs `<Link>`** —
  Next.js's linter requires internal navigation to use `next/link`'s
  `<Link>` component rather than a plain `<a>` tag, so client-side
  navigation/prefetching works. Replace the `<a href="/...">` with
  `<Link href="/...">` (and import `Link` from `"next/link"`).

- **AI review returns `"The AI review response did not match the expected format"`**
  — check Vercel's function logs around the same timestamp for a line
  starting `Anthropic response had no tool_use block` or `... failed
  schema validation` (or the OpenAI equivalents) — these log a preview of
  what the model actually returned, which is the only way to diagnose this
  class of failure. Two real causes hit during development: (1) the
  model's response was truncated because `max_tokens` was too low for a
  detailed review (raised from 4096 to 8192 in `anthropic.ts`), and (2)
  giving the model two competing shape instructions at once (a strict tool
  schema *and* a prose JSON-shape example) caused it to write some fields
  as freeform text instead of the required structure — fixed by giving
  Anthropic only the schema-enforced path, with the prose shape
  description reserved for OpenAI's less strictly-enforced JSON mode. See
  `DECISIONS.md`, "Post-Phase-7 fix" and "Fix: model returning
  `strengths` as a string."

- **AI review returns `401 invalid x-api-key`** — the API key value itself
  is wrong: check for a stray space or line break from copy-pasting, that
  the field isn't still a placeholder, and that the key is active in the
  Anthropic/OpenAI console. Generating a fresh key is often faster than
  debugging a suspect one.

- **AI review returns `Something went wrong on the server: Failed to save AI review`**
  — the `deck_reviews` table is missing its `owner_id` column, meaning
  migration `0006` hasn't been run. See the schema-cache error above.

- **"Couldn't find a Pokémon card named ... in the catalogue" when using
  AI deck generation** — the AI-assist deck generator only builds around a
  real, exact-name match from the provider's own catalogue, by design (it
  never generates a deck around a card it can't verify exists). Use the
  live name suggestions that appear while typing to pick a confirmed
  spelling rather than typing one from memory.

- **AI deck generation fails with a rate-limit message even though AI
  review still works, or vice versa** — the two features have separate
  daily limits (`AI_REVIEW_LIMIT_PER_DAY` and
  `AI_DECK_GENERATION_LIMIT_PER_DAY`), deliberately not shared, since
  generation is a heavier one-shot operation than a review. Check
  `ai_deck_generations` in Table Editor if you need to confirm usage, or
  wait for the 24-hour window to roll over.

- **Decks seem to disappear after a new deployment, or a QR code doesn't
  resolve** — almost always a URL mismatch, not a data-loss bug. Decks
  live in Supabase, completely independent of Vercel deployments. Confirm
  you're testing against the stable production URL (not a per-deployment
  preview URL — see Production deployment above), and that
  `NEXT_PUBLIC_APP_URL` was set to that same stable URL at the time a
  share link/QR code was generated.

- **Card search pagination seems to skip or repeat cards, especially for
  common names** — sorting by `name` alone leaves no defined order for
  cards that share an exact name (there are often dozens of prints of a
  popular Pokémon). Fixed by adding `id` as a secondary, unique sort key
  (`orderBy: "name,id"` in `pokemon-tcg-api.ts`) so pagination is
  deterministic regardless of how many cards share a name.

- **A specific card seems missing from search results entirely** — before
  assuming a bug, check whether filtering by its **set** directly (not
  just by name) surfaces it. If it does, the issue is almost certainly the
  pagination-ordering bug above, not missing provider data.

- **The card catalogue is completely empty right after deploying** — the
  local `cards`/`sets` tables start empty; nothing populates them until
  the sync workflow actually runs at least once. See "Local card database
  + sync" above — trigger it manually via the Actions tab rather than
  wait for the weekly schedule.

- **The sync workflow fails with "Missing required environment variable"**
  — one of the three GitHub Actions secrets (`NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `POKEMON_TCG_API_KEY`) hasn't been added to
  the repo's own secret store yet. These are separate from Vercel's
  environment variables — GitHub Actions can't read those — so the same
  values need entering a second time in GitHub's own Settings → Secrets
  and variables → Actions.

- **`Error: This module cannot be imported from a Client Component module`
  when running a script or tool against this codebase** — that's
  `pokemon-tcg-api.ts`'s `server-only` guard firing, by design, outside a
  Next.js server context. Anything that needs the Pokémon TCG API adapter
  from a standalone script (like the sync script) should import from
  `pokemon-tcg-api-core.ts` instead — the same logic, without the guard.

- **The sync workflow fails partway through with a `Pokémon TCG API
  returned 500`, having only synced a handful of sets** — almost
  certainly the API's 30-requests-per-minute rate limit, even though it
  surfaces as a generic `500` rather than a clean `429`. The sync script
  already paces its requests specifically to avoid this (see
  `DECISIONS.md`); if it's still happening, either the API's limits have
  tightened, or something in the script changed to fire requests faster.
  Simply re-running the workflow is safe either way — every upsert is
  idempotent, so already-synced sets aren't re-done or duplicated, only
  whatever didn't finish gets retried.
