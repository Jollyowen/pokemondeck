# Decisions

Records deliberate deviations from `pokemon-tcg-deck-builder-build-brief.md`
and any ambiguities resolved during implementation.

## Phase 1

- Used Next.js 15 / React 18 pinned via caret ranges rather than exact
  versions, since the brief does not specify exact versions. Update if a
  specific version is required.
- Added an ESLint `no-restricted-imports` rule to catch accidental client-side
  imports of the server Supabase client at lint time, as a belt-and-braces
  addition to the `server-only` import guard already in that file. Not
  required by the brief, but directly supports "never expose the key to the
  browser" (section 5) and "keep all external API secrets server-side"
  (section 17).
- `AI_REVIEW_LIMIT_PER_DAY` defaults to `5` in the env schema if unset, matching
  the value shown in the brief's `.env.example` (section 23), rather than
  being strictly required.
