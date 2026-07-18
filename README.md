# Pokémon TCG Deck Builder

Unofficial Pokémon TCG deck-building tool with AI-assisted deck review. Not
produced, endorsed or supported by Nintendo, The Pokémon Company or Pokémon.

Build status: **Phase 1 of 8 complete** (project foundation). See
`pokemon-tcg-deck-builder-build-brief.md` for the full build brief and phase
plan, and `DECISIONS.md` for implementation notes.

## Stack

Next.js (TypeScript) · React · Tailwind CSS · Supabase Postgres · Zod ·
Vitest · Playwright

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template and fill in real values:
   ```bash
   cp .env.example .env.local
   ```
   Required variables are documented inline in `.env.example`. Missing or
   invalid values will throw a clear error listing every problem when the
   server starts — see `src/lib/env.ts`.
3. Create a Supabase project and run the migrations in `supabase/migrations/`
   in order (`0001` through `0005`), either via the Supabase CLI
   (`supabase db push`) or by pasting them into the SQL editor in order.
4. Get a free Pokémon TCG API key from the developer portal at
   https://dev.pokemontcg.io and set `POKEMON_TCG_API_KEY`.
5. Set `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY` if `AI_PROVIDER=openai`) and
   `AI_MODEL`.

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
npm run test:e2e     # Playwright end-to-end tests (starts a dev server automatically)
```

## Deployment

Target: Vercel for the application, Supabase for the database. Set the same
environment variables from `.env.example` in the Vercel project settings.
Detailed deployment documentation will be added in Phase 8 (Hardening and
deployment).

## Project structure

```
src/
  app/            Next.js App Router pages and layout
  lib/
    env.ts        Validated environment configuration (single source of truth)
    supabase/     Server (service role) and browser (anon key) clients
  types/          Shared TypeScript types (Card, Deck, API)
  schemas/        Zod request validation schemas
supabase/
  migrations/     Ordered SQL migrations
tests/
  unit/           Vitest unit tests
  e2e/            Playwright end-to-end tests
```

## Troubleshooting

- **"Invalid or missing environment variables" on startup** — the error lists
  every missing/invalid variable. Check `.env.local` against `.env.example`.
- **Supabase client errors** — confirm migrations have been applied in order
  and `NEXT_PUBLIC_SUPABASE_URL` / keys match the project you migrated.
