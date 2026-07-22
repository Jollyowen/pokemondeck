# Decisions

Records deliberate deviations from `pokemon-tcg-deck-builder-build-brief.md`
and any ambiguities resolved during implementation.

## Phase 1

- Used Next.js 15 / React 18 pinned via caret ranges rather than exact
  versions, since the brief does not specify exact versions. Update if a
  specific version is required.
- `AI_REVIEW_LIMIT_PER_DAY` defaults to `5` in the env schema if unset, matching
  the value shown in the brief's `.env.example` (section 23), rather than
  being strictly required.

## Phase 2

- Removed the `no-restricted-imports` ESLint rule added in Phase 1 (intended
  to stop the server Supabase client leaking into client components). In
  practice it blocked every legitimate server-side import of that client too
  (API routes, cache layer, provider layer), which is most of how the app
  actually uses it. The real protection — the `server-only` import inside
  `src/lib/supabase/server.ts`, which throws if that file is ever bundled
  for the client — was already sufficient and remains in place.
- The `server-only` package throws unconditionally when imported under plain
  Node (as Vitest does), since the guard only becomes a no-op via Next.js's
  webpack aliasing for server bundles. Added a Vitest alias
  (`tests/mocks/server-only.ts`) so unit tests can import server-only modules
  like the provider adapter without triggering that throw. This is a
  test-environment-only workaround; production behaviour is unaffected.
- Set/search caching reuses the single `card_cache` table from the Phase 1
  migrations rather than adding a new table, using a synthetic
  `provider = "pokemon_tcg_api:set"` value to distinguish cached sets from
  cached cards. Revisit with a dedicated table if set data outgrows this.
- The "serve cached data when the upstream API is unavailable" requirement
  (brief section 5.3) is implemented as: (a) full stale-serving for
  already-cached individual cards (search results and detail view), and (b)
  a best-effort name-substring fallback for search when the API is down.
  Filter combinations beyond name (type, set, rarity) can't be reconstructed
  against the cache during an outage — this is a deliberate scope limit, not
  an oversight.

## Phase 3

- Implemented only the deck endpoints Phase 3 actually needs (`POST
  /api/decks`, `GET /api/decks/:id`, `PATCH /api/decks/:id`). Listing,
  duplicate, delete and share endpoints are explicitly Phase 4 (deck
  library) per the brief's own phase breakdown, so they're deliberately not
  built yet, not missed.
- "Undo for the most recent deck change" is implemented as a single-level
  undo (one snapshot back), matching the brief's literal wording ("the most
  recent"), not a full undo history/stack.
- Autosave sends the full `{ name, format, cards }` payload on every save
  rather than a diff. Simpler and correct at MVP scale (a 60-card deck is a
  small payload); revisit if deck sizes or save frequency ever make this a
  real cost.
- `deck_cards` updates use a delete-then-insert replace strategy rather than
  a diff/upsert, for the same reason — simple and correct at this scale, not
  wrapped in an explicit DB transaction since Supabase's REST interface
  doesn't expose one directly. A rare failure between the delete and insert
  could leave a deck's cards temporarily empty; acceptable for a personal
  MVP, worth revisiting (e.g. a Postgres function) if this matters more later.
- Ownership checks return a generic "not found" (404) rather than a
  distinct "forbidden" (403) when a deck exists but isn't owned by the
  requesting cookie, so a mismatched request can't distinguish "doesn't
  exist" from "exists but isn't yours."
- The special same-name copy limit detector (`getSpecialSameNameCopyLimit`)
  is a conservative sentence-level keyword match (needs "deck", a literal
  "1", and one of "only"/"no more than"/"copy" in the same sentence). It
  covers same-name restrictions (e.g. Prism Star, single-copy ACE SPEC
  cards). It does **not** implement true ACE-SPEC-style deck-wide limits
  that apply across cards with *different* names (e.g. "only 1 ACE SPEC
  card of any kind") — that's a different rule shape than the per-name
  grouping this validator is built around, and is out of scope for the MVP.
- The deck editor's "Add cards" search pane always fetches a fixed small
  page size (12) rather than reusing the catalogue's larger default, to
  keep tiles a reasonable size in the split-pane layout — but now supports
  full pagination via the same Pagination component used on `/cards`
  (originally shipped without it in Phase 3/4; fixed after user testing
  surfaced that only the first 12 matching cards were ever reachable from
  the deck builder).

## Post-Phase-4 fix: unstable pagination for same-named cards

- Search results were sorted with `orderBy: "name"` only. Many cards
  legitimately share an identical name across different printings (e.g.
  many "Wailord" prints across sets) — with no tiebreaker, ties have no
  guaranteed stable order, which let a card's position shift between the
  page-1 and page-2 requests. In practice this meant some cards fell into
  the gap between pages and never appeared in search results at all, even
  though they were correctly counted in `totalCount` and correctly returned
  when filtered by set directly (confirmed via user testing with a
  Journey Together/SV9 Wailord print).
- Fixed by sorting on `orderBy: "name,id"` — `id` is unique per card, so
  pagination is now deterministic regardless of how many cards share a name.

## Phase 5

- Statistics are computed entirely client-side (`useMemo` over the deck
  editor's already-loaded `cards` and `knownCards` state) rather than via an
  API endpoint. This is what makes "update immediately after deck changes"
  (a completion criterion) essentially free — there's no round trip to wait
  on, the numbers recompute on the same render as the edit. It also trivially
  satisfies "statistics do not require an AI API," since nothing here calls
  any external service at all.
- Draw-support and search-support detection (the two statistics that
  inherently depend on interpreting free text) live in a separate,
  versioned module (`src/lib/deck/text-heuristics.ts`,
  `TEXT_HEURISTICS_VERSION`), per the brief's requirement to keep that kind
  of logic isolated and versioned. Both are reported back with an
  `estimatedFields` marker so the UI can visibly label them as estimates
  rather than presenting them with the same confidence as structural counts.
  The patterns are deliberately conservative (plain-language "draw ... card"
  / "search your deck" phrasing) — false negatives on unusually-worded cards
  are more likely than false positives, which seemed the safer failure mode
  for a labelled estimate.
- Pokémon type distribution counts a card under *every* type it has (e.g. a
  dual-type card adds to both type buckets), rather than splitting its
  quantity between them or picking a "primary" type — there's no canonical
  primary type in the data to prefer, and full-count-per-type is the more
  common convention in deck-building tools.
- Evolution stage distribution has an explicit "other" bucket for Pokémon
  whose subtypes don't literally include "Basic"/"Stage 1"/"Stage 2" (e.g.
  certain restored/fossil or mechanic-specific cards), rather than silently
  dropping them from the total or guessing a stage.

## Addition beyond the 8-phase plan: evolution-line quick-add

- Not part of the brief's phase plan — added at the user's request after a
  conversation about what data the provider exposes. When a Pokémon in the
  deck has an evolution line (`evolvesFrom`/`evolvesTo`), the deck list now
  shows an "Evolutions" toggle that looks up matching printings by exact
  name and offers one-tap add for each, so completing a Basic → Stage 1 →
  Stage 2 line doesn't require manually re-searching each stage.
- Added `evolvesTo` (`string[]`) to the internal `Card` model and the
  provider adapter — the API already returns it, but nothing in the
  original phase plan needed it, so it wasn't captured until now.
- The "search by exact name" behind this reuses the existing `/api/cards`
  endpoint rather than adding a new one — the API's own search is a
  prefix/phrase match, not exact, so results are filtered client-side to
  `card.name.toLowerCase() === target.toLowerCase()` before being offered
  as suggestions, to avoid surfacing unrelated cards that merely start with
  or contain the same words.
- Matching is by card name only, since that's what `evolvesFrom`/`evolvesTo`
  give us. This can't distinguish between mechanically-different cards that
  happen to share a name (e.g. a regular evolution vs. an unrelated card
  with a coincidentally identical name) — the suggestion list shows the set
  name alongside each option specifically so the person adding it can tell
  printings apart and make that judgment themselves, rather than the app
  guessing.
- Fixed a small related bug while wiring this up: `handleAddCard` in the
  deck editor previously only updated the deck's card-quantity list, not
  the `knownCards` lookup map used for rendering. That was masked for the
  existing "Add cards" search pane, since anything added from search was
  already in `knownCards` via the search results themselves — but cards
  added via evolution-line suggestions come from a separate fetch, so
  they'd have rendered as "Unresolved" until the next autosave round-trip.
  Fixed so any newly added card is registered in `knownCards` immediately,
  regardless of where it was added from.

## Phase 6

- Revoking sharing clears `share_token` to `null` (not just flipping
  `share_enabled` to false). Re-enabling sharing always generates a brand
  new token rather than reusing the old one. This means an old shared
  link/QR code can never start working again just because someone
  re-enabled sharing later — each "enable" is a genuinely fresh grant, which
  seemed like the safer default for something people might screenshot or
  print as a QR code.
- The public shared-deck endpoints (`GET /api/shared-decks/:token`, `POST
  /api/shared-decks/:token/copy`) return a deliberately narrow
  `PublicSharedDeck` shape from the repository layer — no `ownerId`, no
  `shareToken` itself, no `deletedAt` — rather than reusing the internal
  `Deck` type and trying to remember to strip fields at the API boundary.
  Making the narrow shape the thing that comes out of the database query
  itself means there's no field to accidentally leak later.
- The public shared page computes validation and statistics fresh on every
  request (via the same pure `computeDeckValidation` /
  `computeDeckStatistics` functions used elsewhere) rather than reading a
  persisted `status` column value the way the owner's own deck view does.
  There's no owner context on a public request to persist a recomputed
  status back through, and it doesn't need one — the pure functions don't
  care who's asking.
- "Stops working immediately if revoked or deleted" is satisfied
  structurally, not just by testing: `getSharedDeckByToken` filters on
  `share_enabled = true` and `deleted_at is null` on every single call,
  so there's no separate cache or flag to forget to check — a revoked or
  deleted deck simply stops matching the query on the very next request.

## Phase 7

- **Requires a new migration**: `0006_deck_reviews_owner_id.sql` adds an
  `owner_id` column to `deck_reviews`. The original table (Phase 1) only
  had `deck_id`, which is enough to cache a review per deck, but not enough
  to answer "how many reviews has this owner generated in the last 24
  hours" without joining through `decks` on every rate-limit check. Adding
  the column directly is simpler and faster at essentially no cost, since
  this table was still empty before this phase existed. **Run this
  migration before deploying Phase 7** — reviews will fail to save without it.
- Both provider adapters funnel through one shared safety gate
  (`parseAndValidateReviewOutput` in `review-schema.ts`) regardless of how
  each one gets structured output — Anthropic via forced tool-use (the more
  reliable mechanism for that API), OpenAI via `response_format:
  json_object` plus explicit shape instructions in the prompt. Whichever
  provider is configured, "invalid output is rejected safely" comes from
  the same one code path, not two separately-trusted ones.
- The swap-verification pipeline (`verify-review.ts`) implements every
  numbered check from the brief's section 15 as one pure function, covered
  by 10 unit tests that were run and passed before any UI was built on top
  of it — this felt like the highest-stakes correctness surface in the
  whole app (it's the one place a model mistake could otherwise reach the
  user as something that looks verified), so it got built and tested first,
  ahead of the provider adapters or the UI.
- Candidate-card gathering (`candidate-cards.ts`) is deliberately narrow and
  needs-driven rather than "search broadly and let the model pick": it only
  looks for (a) evolution-line completions for Pokémon already in the deck,
  (b) a small curated list of well-known staple draw/search Trainer cards,
  and only when the deck's own statistics show it's actually light on
  those, and (c) Basic Energy matching types already present, again only
  if energy count looks low. This keeps the candidate pool (capped at 24)
  genuinely relevant rather than padding the prompt with irrelevant cards
  the model would just have to ignore. The curated staple-card list is a
  real, deliberate content choice — flagging it here rather than treating
  it as self-evidently correct, since "which staples" is a judgment call
  that reasonable people could make differently.
- Applying a suggested swap is an explicit, separate user action (an
  "Apply this swap" button) — never automatic as part of generating a
  review, per the brief's "never apply a swap automatically." Clicking it
  reuses the exact same client-side card-mutation path as manually
  adding/removing cards, so an applied swap goes through the same autosave
  and re-validation as any other edit, not a special-cased write.
- Rate limiting (`AI_REVIEW_LIMIT_PER_DAY`) is enforced server-side in
  `review-service.ts`, checked *after* the cache-hit check — re-opening a
  deck and viewing an already-generated review never counts against the
  limit; only genuinely new generations do.
- Deferred to Phase 8 (hardening) rather than built here: rate-limiting
  card *searches* generally (brief section 17 lists this alongside AI
  review rate-limiting, but only the AI review limit is in Phase 7's
  explicit completion criteria) — general request throttling reads as
  broader infrastructure hardening than a Phase 7 concern specifically.
- Error logging for AI failures (`review-service.ts`) deliberately logs
  only provider name, deck ID, and the error message — never the owner
  cookie value, never the deck name, never full card contents — per the
  "log provider errors without recording owner cookies, secrets, or
  unnecessary deck-name data" requirement.
- Both adapters are built and the app is genuinely provider-agnostic via
  `AI_PROVIDER`, per the brief. In practice, only the Anthropic path has
  been exercised so far, since the deployed environment only has
  `ANTHROPIC_API_KEY` configured, not `OPENAI_API_KEY` — flagged back when
  this phase started. The OpenAI adapter follows the identical pattern
  (same prompt, same schema validation, same verification pipeline
  downstream) so there's no reason to expect it behaves differently, but
  it hasn't actually been run against a live OpenAI key. Worth an explicit
  test pass if/when an OpenAI key is added.

## Post-Phase-7 fix: model returning `strengths` as a string, not an array

- In production testing, Anthropic's response failed schema validation —
  the logged raw output showed `"strengths":"\n<strengths>\n<item>\n..."`,
  a string full of XML-like tags, where an array of `{title, explanation,
  evidenceCardIds}` objects was required.
- Root cause: the prompt was giving the model two competing shape
  instructions at once — a forced tool call with a strict `input_schema`
  (which should fully determine the shape), *and* a prose instruction
  ("Respond with ONLY a single JSON object matching this exact shape...")
  with its own textual example of the same shape. The two together seem to
  have pulled the model toward writing some fields in a freeform textual
  style rather than strictly honouring the tool's array-of-objects
  definition.
- Fix: split the prompt into `REVIEW_TASK_INSTRUCTIONS` (the analytical
  task, shared across providers) and `REVIEW_JSON_SHAPE_INSTRUCTIONS` (the
  prose shape description). Anthropic's adapter now uses only the task
  instructions plus a direct "call the tool" instruction — it no longer
  gets a competing prose shape description, since the tool schema is
  already the authority on shape. OpenAI's adapter still gets both, since
  `response_format: json_object` has no schema-enforcement of its own and
  genuinely needs the prose description.
- Also increased `max_tokens` from 4096 to 8192 as a related defensive fix
  — a full review with several strengths/issues/swaps and explanations for
  each could plausibly need more than 4096 tokens, and a truncated
  tool-call would produce a similar-looking validation failure (missing
  fields) even with the prompt fix in place.
- Added logging of the raw model output (truncated to 1000 chars) on any
  schema-validation failure, in both adapters. This is what actually made
  the bug diagnosable — without it, "did not match the expected format"
  gave no way to tell a truncation, a genuine format deviation, and a
  missing-tool-call apart. Worth keeping permanently, not just for this
  incident: any future model-behaviour drift will need the same visibility.
- `REVIEW_PROMPT_VERSION` bumped to `1.1.0` since the instructions changed
  meaningfully — this also invalidates any previously cached reviews (the
  hash includes the prompt version), which is correct: a review generated
  under the old, bug-triggering prompt shouldn't be silently reused as if
  it were equivalent to one generated under the fixed prompt.

## Addition: broader AI candidate search + deck goal field

- Both requested by the user after trying the AI review and finding swap
  suggestions rarely appeared. Two changes:
  1. **Candidate search is now always-on rather than threshold-gated** for
     draw/search/utility staples — previously it only searched for these
     when the deck's own statistics looked thin, which meant a deck that
     already had *some* draw support got no alternatives to compare
     against at all. Also added a new search step for other attackers
     sharing a type already in the deck, and candidates are now filtered
     by format legality *before* being added to the pool (not just
     verified afterward), so no candidate slot is wasted on something that
     could never survive verification anyway. Cap raised from 24 to 30 to
     accommodate the extra search step.
  2. **New optional `strategyNotes` field on each deck** (migration
     `0007_decks_strategy_notes.sql`) — a short, user-entered statement of
     the deck's intended goal (e.g. "fast aggro"), editable in the deck
     editor next to the name, autosaved the same way. Passed into the AI
     review as part of the untrusted data block (never as an instruction —
     the prompt explicitly tells the model to treat it as data and ignore
     any embedded command inside it, same as card text). Included in the
     review cache hash, so changing your stated goal correctly invalidates
     a stale cached review. Carries across duplicate and shared-deck copy,
     and is shown on the public shared page too, since it's not
     owner-identifying information.
- `REVIEW_PROMPT_VERSION` bumped to `1.2.0` for the strategyNotes-aware
  instructions.

## Addition: card price display (UI only, not sent to the AI)

- User asked about including price data. Clarified first: the brief
  explicitly excludes prices from the AI review payload (section 14's
  "Do not send" list), so this is implemented as a **display-only**
  feature — prices are never part of what reaches the model. This is
  structurally guaranteed, not just a convention: `toDeckReviewCard` in
  `review-cards.ts` maps an explicit allowlist of fields (never a spread
  of the full `Card` object), and `price` was deliberately left off that
  list.
- Added `Card.price` (nullable) sourced from the provider's `tcgplayer`
  field. A card can have several priced print variants (normal, holofoil,
  1st edition, etc.); `extractPrice` picks one representative variant via
  a preferred-order list (normal → holofoil → reverse holofoil → ...),
  falling back to whatever variant is actually present. This is a
  simplification — the app shows one price, not the full variant
  breakdown — reasonable for a personal tool, worth revisiting if variant-
  specific pricing ever matters.
- Only TCGplayer (USD) is used, not the API's Cardmarket (EUR) data —
  picked one source rather than reconciling two currencies/markets for a
  single displayed number.
- Displayed on: catalogue tiles, the deck-builder's "Add cards" tiles, the
  card detail page (with low–high range and a link to TCGplayer), and as
  a new "Estimated value" total in the deck editor's statistics section
  (`computeEstimatedDeckValue`, pure and unit-tested) — a natural
  extension once price existed on the model, not something separately
  requested, so flagging it as an addition of my own judgment rather than
  a literal ask.

## Addition: strategy archetype dropdown

- Follow-up to the free-text `strategyNotes` field above. The user shared
  research on the three main Pokémon TCG deck archetypes (Aggro/Beatdown,
  Control/Stall, Mill) and asked whether the goal field could be a
  dropdown instead of pure free text.
- Implemented as **dropdown + the existing free-text field together**,
  not a replacement: `strategyArchetype` (`"aggro" | "control" | "mill" |
  "other" | null`, new `strategy_archetype` column, migration
  `0008_decks_strategy_archetype.sql`) captures the broad category:
  `strategyNotes` remains for optional specific detail layered on top
  (e.g. archetype "aggro" + notes "focused on early Charizard pressure").
  Both are sent to the AI as data, both are included in the review cache
  hash, both carry across duplicate/share, same pattern as strategyNotes
  alone before this.
- Added an "Other" option beyond the user's three researched categories,
  since plenty of real decks (toolbox, midrange, combo) don't cleanly fit
  Aggro/Control/Mill and forcing a wrong-but-required category seemed
  worse than an honest "other."
- `REVIEW_PROMPT_VERSION` bumped to `1.3.0` for the archetype-aware
  instructions.

## Fix + addition: swap suggestions showing IDs instead of names, card image previews, deck-card metadata

- **Root cause of the "swaps show IDs, not names" bug**: the review API
  response only ever contained the raw `DeckReviewResult` — text, card
  IDs, no actual card data. Deck cards happened to already be in the
  client's `knownCards` map (from the initial deck load), so evidence/swap
  references to *those* resolved fine — but suggested swap *additions*
  come from the AI's candidate pool, which the client had never seen, so
  those always fell back to showing a bare ID. This wasn't a rendering bug,
  it was a missing-data bug.
- Fixed at the source: `review-service.ts` now resolves and returns full
  `Card` data for every ID referenced anywhere in a review result
  (`collectReferencedCardIds`, pure and unit-tested) — strengths evidence,
  issues evidence, and both sides of every suggested swap — via the same
  cache-then-provider resolution already used elsewhere. Both `POST
  /api/decks/:id/review` and `GET /api/decks/:id/reviews/latest` now
  return `resolvedCards` alongside the result; the deck editor merges this
  into its existing `knownCards` map on load and after every regenerate.
- Added `Card.rarity` (plain string from the provider, e.g. `"Rare
  Holo"`), not previously captured since nothing needed it before this.
- Added a reusable `CardImageModal` — click any card thumbnail (deck-list
  entries, the deck-builder's "Add cards" search tiles, and swap
  suggestion cards) to see the full-size image in an overlay, dismissible
  via click-outside, Escape, or a Close button. Scoped intentionally: the
  standalone `/cards` catalogue already opens a full detail page on click
  (which shows the large image plus stats/legalities), so that flow was
  left as-is rather than replaced with a modal — the ask was read as being
  about the three places that had *no* way to see a larger image before
  (search-while-building, the deck list, and swap suggestions), not about
  changing an existing, working interaction elsewhere.
- Deck list rows now show a thumbnail, set name, type(s), rarity, and
  price inline — same information already shown on catalogue tiles,
  brought to the deck list where it didn't exist before.
- Suggested swaps now render as visual before/after: small thumbnails for
  the removed and added cards side by side with an arrow between them,
  each independently clickable for a full-size preview, rather than a
  single line of card names.

## Fix: "Apply this swap" could be clicked repeatedly

- The apply button had no memory of having already been clicked, so
  clicking it multiple times re-applied the same swap each time (removing
  and re-adding the same cards repeatedly). Fixed by tracking applied swap
  indices in local component state (`appliedSwapIndices`) — once applied,
  a swap's button becomes disabled and relabels to "Applied ✓". This state
  resets whenever a review is freshly loaded or regenerated, since a new
  review means new (unapplied) swap suggestions, not a continuation of the
  old ones.

## Post-Phase-3 fix

- All API routes now wrap their handler in `withApiErrorHandling`
  (`src/lib/api/with-error-handling.ts`), which turns any unhandled thrown
  error into a structured `ApiError` JSON response (visible in the browser)
  instead of a bare, bodyless 500 — the latter is what actually happened
  when deck creation failed in production, making it hard to diagnose from
  the client console alone. The underlying error is still logged
  server-side via `console.error` for full detail in Vercel's function logs.

## Phase 4

- Added a read-only `getOwnerId()` alongside the existing
  `getOrCreateOwnerId()` (`src/lib/owner.ts`). The home page needs to check
  for existing decks to decide whether to redirect to the library, but
  Next.js does not allow setting cookies during a Server Component render
  (only in Route Handlers/Server Actions) — calling the cookie-creating
  version there would throw for first-time visitors. The read-only version
  returns `null` when no cookie exists yet, which is fine: a visitor with no
  cookie also has no decks, so the redirect decision is correct either way,
  and the cookie still gets created for real the first time a deck is
  actually saved, inside a Route Handler.
- "Undo" for delete is implemented as: soft-delete immediately, then show a
  6-second toast whose "Undo" button calls a dedicated `POST
  /api/decks/:id/restore` endpoint (clears `deleted_at`). This endpoint
  isn't in the brief's explicit list in section 10, but is a direct,
  reasonable equivalent for the "undo where appropriate" requirement in
  section 8 — implementing undo via a client-side delay before actually
  calling DELETE would leave a window where a second device/tab could still
  see the "deleted" deck, whereas soft-delete-then-restore is immediately
  consistent.
- Rename reuses the existing `PATCH /api/decks/:id` endpoint (just the
  `name` field) rather than a dedicated rename endpoint, since the brief's
  section 10 endpoint list doesn't include one and PATCH already covers it.
- The deck library's Phase-4 e2e test (`tests/e2e/deck-library.spec.ts`) is
  written and typechecks but, like the Phase 2 e2e suite, couldn't be
  executed in this build environment — see the Phase 2 note above about
  Playwright's browser download being blocked by this sandbox's network
  allowlist. Runs normally via `npm run test:e2e` outside this environment.

## Phase 8: Hardening and deployment

- **Unit tests added** for every part of section 21's required test list
  that is genuinely unit-testable without a database: explicit 59/60/61
  card boundary tests (matching the brief's literal wording, on top of the
  equivalent generic tests already in place since Phase 3), share token
  format/uniqueness/non-predictability, AI provider selection via
  `AI_PROVIDER`, and rejection of malformed AI output — including a
  regression test built directly from the "strengths returned as a string"
  bug hit in production, so that specific failure mode can never silently
  regress.
- **Deliberately not covered by an automated test, and why**: several of
  section 21's required tests are inherently database-integration tests —
  cross-owner read/write isolation, "revoking sharing invalidates the
  URL," "deleting a deck invalidates the share URL," and "a cached review
  is reused for an unchanged deck." Building these properly needs either a
  live Supabase test project wired into CI or extensive mocking of
  Supabase's chainable query builder. The mocking route was deliberately
  rejected: realistically faking `.from().select().eq().eq().is()...`
  chains produces tests that mostly verify the mock was called correctly,
  not that the underlying authorization/invalidation logic works — a false
  sense of coverage is worse than an honest gap. Each of these is still
  enforced structurally in the code itself (every owner-scoped repository
  function filters on `owner_id`; `getSharedDeckByToken` re-checks
  `share_enabled` and `deleted_at` on literally every call rather than
  relying on a cache to invalidate), and this reasoning is repeated in the
  README's "Testing scope and known limitations" section so it's visible
  without having to find this file. A Supabase local dev instance as a CI
  service container is the natural way to close this gap later.
- Similarly, an initial attempt at a "shared deck copy" e2e test was
  written and then deliberately deleted rather than kept: the `/shared/
  [token]` page is server-rendered directly from the repository layer, not
  fetched client-side, so Playwright's network-level route mocking (which
  every other e2e test in this repo relies on) cannot meaningfully
  exercise it — the resulting test would have proven only that a
  hand-mocked page renders hand-mocked data, not that the real
  server-rendered flow works. Kept the honest gap and documented it rather
  than ship a test that looks like coverage but isn't.
- **Accessibility fixes**: added missing accessible labels to several
  inputs that had none (deck name, strategy notes, inline rename, the
  read-only share-link field — all previously relying on visual context
  alone, which a screen reader user wouldn't have). Added `role="alert"` /
  `role="status"` with `aria-live` to status and error messages across the
  catalogue, deck library, share panel, review panel, and new-deck form,
  so state changes are actually announced rather than silently appearing
  on screen. Fixed the card image modal's focus management — it
  previously opened without moving keyboard focus into it and without
  restoring focus to the trigger on close, both real WCAG 2.2 AA gaps for
  keyboard/screen-reader users.
- **Error monitoring hook**: added `reportError()`
  (`src/lib/monitoring/report-error.ts`) as the single place server-side
  errors are reported, replacing direct `console.error` calls in the API
  error wrapper and both AI provider adapters. It currently just logs
  (identical behaviour to before), but wiring in a real provider (Sentry
  or similar) later is a one-function change here rather than a
  search-and-replace across the codebase — no monitoring service is
  actually configured, since the user has no such account set up.
- **CI** (`.github/workflows/ci.yml`): lint, typecheck, unit tests, and
  e2e tests, each as a separate job, e2e depending on the other two
  passing first. Uses placeholder (non-secret) environment values, since
  the app needs *some* value for every required env var to start up at
  all (per `env.ts`'s validation), even though most e2e tests never reach
  a real Supabase/API/AI backend thanks to network-level mocking.
- **README**: substantially expanded — a real step-by-step production
  deployment section (including the `NEXT_PUBLIC_APP_URL`
  preview-vs-production pitfall that caused real confusion earlier in this
  project), and a troubleshooting section built directly from every actual
  issue hit and fixed during this build, not a generic template — wrong
  Supabase key type, missing migrations, stale lockfile, the ESLint
  Link-vs-anchor build failure, both categories of AI review failure,
  invalid API keys, and the pagination-ordering bug. Test fixtures
  (`tests/fixtures/deck-fixtures.ts`) added for e2e tests going forward,
  though most existing unit tests still define minimal fixtures inline,
  which remains appropriate for tightly-scoped pure-function tests.

## Fix: dead "Format" toggle inside the deck editor's search pane

- The deck editor rendered two independent format controls at once: the
  top-right toggle (which actually drives every legality/greyscale check
  across the whole editor — deck list included) and a second, separate
  format toggle inside the reused `CardSearchFilters` component (built
  originally for the standalone `/cards` catalogue page, where it's the
  only format context that exists). The second one was never wired to
  anything in the deck editor — `AddCardTile`'s greyscale reads the deck's
  own top-level `format` state, not the search pane's — so clicking it
  visibly did nothing, which is exactly what got reported.
- Fixed by adding an optional `showFormatToggle` prop to
  `CardSearchFilters` (default `true`), and passing `showFormatToggle=
  {false}` specifically from the deck editor, where the toggle would
  otherwise be redundant with — and confusingly disconnected from — the
  deck's own format control. The standalone `/cards` catalogue page is
  unaffected and keeps its toggle, since that's the only format control it has.

## Addition: AI deck generation ("AI assist" on New Deck)

- New feature, beyond the brief's 8 phases: generating a full starting
  deck from a style of play, a specific Pokémon, and optional free-text
  detail, rather than only reviewing/suggesting swaps on a deck that
  already exists.
- Deliberately built as a *separate* pipeline from AI review
  (`generation-schema.ts`, `generation-prompt.ts`, `verify-generation.ts`,
  `generation-service.ts`, `generation-repository.ts`), not bolted onto
  the existing review code, even though the two share patterns
  (provider-neutral interface, instructions/data separation, schema
  validation gate, never-trust-the-model verification). Generating a
  60-card deck from nothing and reviewing/tweaking an existing one are
  different enough operations — different candidate pool sizes, different
  output shapes, different rate limits — that forcing them through one
  interface would have made both harder to reason about.
- **New migration**: `0009_ai_deck_generations.sql` — a lightweight table
  existing purely for rate-limit bookkeeping (id, owner_id, created_at),
  not for caching generated decks. Deliberately not caching by input hash
  the way reviews are: "generate me a deck" is a creative, one-shot action
  where getting a different result on a second click with the same inputs
  is reasonable and possibly desirable, unlike a review of a specific
  existing deck, where the whole point of caching is that the same deck
  should get the same answer until it changes.
- **New env var**: `AI_DECK_GENERATION_LIMIT_PER_DAY`, default 3 —
  intentionally lower than `AI_REVIEW_LIMIT_PER_DAY`'s default of 5, since
  generating a full deck is a heavier one-shot operation than reviewing an
  existing one. Enforced via a dedicated `GenerationRateLimitError`
  (rather than reusing `ReviewRateLimitError`) specifically so the
  rate-limit message correctly says "AI deck generations," not "AI
  reviews" — an easy copy-paste mistake to make and a confusing one for
  the person hitting it.
- **Verification is enforcement by construction, not filtering after the
  fact**: `buildVerifiedGeneratedDeck` processes the model's proposed
  cards one at a time, capping quantity against the running copy-limit
  total and the remaining space under 60 as it goes, rather than building
  the model's full proposed list and then checking/rejecting it
  wholesale. This means a model that gets quantities slightly wrong
  produces a deck that's still exactly copy-limit-compliant and never
  over 60, rather than one that gets rejected outright over a fixable
  quantity issue. Covered by 11 unit tests, written and passing before any
  UI was built on top of it — same order of operations as the swap
  verifier in Phase 7, since this felt like the equivalent highest-stakes
  correctness surface for this feature.
- **Explicit design decision: never pad a short result up to 60.** If the
  model (or the verification pipeline's own trimming) produces fewer than
  60 cards, the resulting deck simply lands in the editor under 60 cards,
  shown honestly as a draft — never silently topped up with generic
  energy or anything else the model didn't actually choose. The existing
  deck editor (search, evolution-line suggestions, AI review's own swap
  suggestions) is the intended way to finish it, rather than duplicating a
  "top-up" mechanic specific to generation.
- **Candidate pool is broader than the review feature's** (up to 80 cards
  vs. 30): the target Pokémon and its full evolution line, other Pokémon
  sharing its type(s) as support/backup attackers, the existing curated
  staple Trainer lists (draw/search/utility), and matching Basic Energy —
  all filtered by format legality before being offered to the model, same
  as review candidates.
- **Pokémon name resolution** happens before any AI call: the named
  Pokémon is looked up by exact match against the real catalogue first
  (preferring a printing legal in the requested format), and generation
  fails fast with a clear "couldn't find that Pokémon" error if no match
  exists, rather than asking the AI to build a deck around a card that
  might not be real. The UI also offers live name suggestions while
  typing, specifically to reduce how often that error path gets hit from
  an honest typo.
- The AI's plain-language explanation of the deck's strategy is shown
  once, immediately after generation, via a dismissible banner in the
  deck editor (passed through `sessionStorage`, keyed by deck ID, cleared
  on read so it never reappears on a later visit) — reasonable context to
  surface up front rather than something the user has to dig for, and
  cheap to implement given the AI already has to produce this text as
  part of its structured output.

## Fix: requested Pokémon silently excluded from its own generated deck

- Real user report: asking to generate a deck around Wailord produced a
  deck with no Wailord in it at all, only 2 unique Pokémon (both
  duplicates of an unrelated card), 20 Trainers, and zero Energy. The AI's
  own explanation said plainly that Wailord and Water Energy "were not
  present in the supplied candidate pool" — this was a real bug in
  candidate gathering, not the model going off-script.
- Root cause: `gatherDeckGenerationCandidates`'s `addIfNew` filtered every
  candidate by format legality before it ever reached the model —
  including the requested Pokémon itself. If the only catalogue printings
  of the requested card weren't legal in whatever format was selected,
  the target got silently dropped from the candidate pool while its
  name/type were still used to steer the rest of the search (evolution
  line, same-type support, energy) — producing exactly the "deck built
  around a Pokémon that isn't in it" symptom reported.
- Fixed by removing the format-legality filter from candidate gathering
  entirely for generation. This is also the more consistent design:
  format legality is non-destructive everywhere else in this app (flagged
  after the fact, never silently removed — see the format filter on
  `/cards`, and deck validation's `FORMAT_ILLEGAL` issue), so pre-filtering
  candidates by format was actually inconsistent with that principle, not
  just buggy in this one case. `buildVerifiedGeneratedDeck` never checked
  format legality anyway (by design — see Phase 7 notes), so no change was
  needed there; an illegal card that ends up in a generated deck now just
  shows up as a normal `FORMAT_ILLEGAL` validation issue once the deck
  lands in the editor, exactly like a manually-built deck would.
- To keep the model leaning toward legal cards where it reasonably can,
  the prompt now explicitly says to prefer candidates with
  `legalInSelectedFormat: true` when they serve the deck equally well,
  while allowing an illegal one when it's genuinely the only or best
  option (mirroring the same allowance a human deck-builder has).
- Also strengthened the composition guidance to explicitly forbid a
  zero-Energy decklist whenever Energy candidates exist, rather than
  leaving deck composition balance as only a soft "aim for" suggestion —
  the reported deck's 20-Trainer/0-Energy split suggests composition
  balance is worth reinforcing regardless of the target-exclusion bug.
- Added `targetLegalInFormat` to the candidate-gathering result. When the
  requested Pokémon truly has no legal printing in the chosen format, the
  deck's one-time explanation banner now says so explicitly up front
  (rather than leaving the person to puzzle out a `FORMAT_ILLEGAL`
  validation message on their own), and suggests trying a different
  format or Pokémon.
- `GENERATION_PROMPT_VERSION` bumped to `1.1.0` for the instruction
  changes.

## Follow-up fix: target resolution capped at 10 results, ordered alphabetically not by recency

- User clarified that Wailord *is* legal in both Standard and Expanded —
  which meant the previous fix (removing the format-legality pre-filter)
  wasn't the complete explanation for the original bug report, only a
  genuine but separate correctness improvement.
- Actual likely cause, found on closer inspection: `findExactNameMatches`
  (used to resolve the requested Pokémon) only fetched the first 10
  results, and the underlying search always orders by `"name,id"` —
  alphabetically by set ID, not by release date. A Pokémon with many
  printings across TCG history can easily have its most recent (and thus
  most likely currently-legal) printing sort well past position 10,
  meaning it may never even be fetched, regardless of any legality
  filtering downstream.
- Fixed by fetching up to 100 results specifically for the primary target
  lookup (the one thing the whole request is grounded in), rather than
  the default 10 used for the cheaper, non-critical lookups (evolution
  names, staple Trainer names) elsewhere in the same file.
- Added lightweight diagnostic logging (plain `console.log`, deliberately
  *not* routed through `reportError` since this isn't a failure — doing so
  would misrepresent it as an error incident if a real monitoring provider
  is ever wired in) recording, per generation request: how many printings
  of the target were found, how many made it into the candidate pool, and
  — after the model responds — whether the target actually appears in the
  final verified deck. This is what should make the *next* report of this
  shape immediately diagnosable from Vercel's logs, rather than requiring
  another round of hypothesis-and-guess the way both of these fixes did.

## Fix: search ordering, and forcing evolution prerequisites into generated decks

- **All card search now orders newest-to-oldest by default**
  (`orderBy: "-set.releaseDate,id"`, replacing `"name,id"`), per explicit
  request. This applies everywhere `searchCards` is used — the `/cards`
  catalogue, the deck builder's search pane, and every AI candidate
  lookup — since they all share one provider method. `id` is kept as a
  secondary sort key for the same pagination-stability reason as before
  (many cards share an identical release date, same as many sharing an
  identical name). This also directly narrows the class of bug the two
  generation fixes above were about: a name-based lookup now naturally
  surfaces a Pokémon's most recent printing first, rather than depending
  on an alphabetical-by-set-ID order that has no relationship to recency.
- **Generated decks now deterministically include evolution
  prerequisites.** Real report: a generated deck included Stage 1 Pokémon
  without any copies of the Basic they evolve from — essentially
  unplayable, since there'd be no legal way to get that Basic into play in
  the first place. Rather than only asking the model to do this correctly
  (advisory, and evidently not reliable enough on its own), added
  `ensureEvolutionPrerequisites` — a deterministic post-processing pass,
  run immediately after `buildVerifiedGeneratedDeck`, that walks the full
  evolution chain (Stage 2 → Stage 1 → Basic) and adds a matching
  candidate-pool printing for any missing link. Same discipline as the
  rest of verification: never invents a card outside the candidate pool,
  added quantity is capped by the normal copy limit and by remaining space
  under 60, and a prerequisite that genuinely isn't in the candidate pool
  simply can't be forced — the deck will show the normal validation issue
  once it lands in the editor, same as if a person had built it that way
  by hand. Covered by 8 new unit tests; two of them initially failed for a
  mundane reason (a missing `supertype: "Pokémon"` override in the test
  fixtures themselves, not the implementation) — fixed and confirmed
  passing before wiring this into the actual generation service.
- This is a genuinely different kind of fix from the two before it in this
  session: the previous two were bugs in *finding* real cards (excluded by
  an over-eager filter, or missed by too small a page size). This one is
  a new deterministic *rule*, enforced by construction rather than left to
  the model's judgment — the same category of thing copy limits and the
  60-card cap already were, just not implemented until a real deck
  surfaced the gap.

## Fix: e2e test failures found by CI's first real run

- CI ran the Playwright suite for real for the first time (still can't be
  executed in this sandbox — see the Testing scope section) and correctly
  caught 4 failures. None were app bugs; all were mistakes in the test
  code itself:
  1. **`ai-review-flow.spec.ts` — strict-mode text ambiguity.**
     `getByText("Trainer A")` matched two elements: the deck-list entry's
     name and the swap group's accessible name (`"−4× Trainer A"`, which
     contains "Trainer A" as a substring under Playwright's default
     non-exact text matching). Fixed with `{ exact: true }`.
  2. **`ai-review-flow.spec.ts` — the second test timed out entirely.**
     Root cause: it registered a *second* `page.route` handler for the
     same `/api/decks/deck-1` URL pattern already mocked in
     `beforeEach`, and called `route.continue()` for methods it didn't
     explicitly handle. `route.continue()` sends the request to the real
     network — it does **not** fall back to an earlier-registered
     `page.route` handler, which is an easy assumption to get wrong
     coming from other mocking libraries. Since there's no real backend
     in CI, that GET request just hung. Fixed by making each test's
     handler fully self-contained (handles GET, and PATCH where needed,
     directly) and using `route.abort()` instead of `route.continue()`
     for anything unhandled, so an unmocked request fails fast instead of
     hanging against a nonexistent server.
  3. **`card-search.spec.ts` — pagination "Next" button ambiguity.**
     Next.js's dev-mode floating dev-tools button has the accessible name
     "Open Next.js Dev Tools", which contains "Next" as a substring —
     colliding with our own pagination button under default (non-exact)
     role-name matching. Only manifests when running against `next dev`
     (which is what Playwright's `webServer` uses), not in production.
     Fixed with `{ exact: true }`.
  4. **`deck-sharing.spec.ts` — `TypeError: page.getByDisplayValue is not
     a function`.** A genuine mistake on my part: `getByDisplayValue` is a
     Testing Library method, not part of Playwright's own API — it simply
     doesn't exist here. Fixed by using `getByLabel("Shareable deck
     link")` (matching the `aria-label` added to that input during the
     Phase 8 accessibility pass) combined with the correct `toHaveValue`
     assertion for checking an input's value.
- Also bumped `actions/checkout` and `actions/setup-node` to v5 and the
  workflow's `node-version` to 22, clearing the "Node.js 20 deprecated"
  warnings GitHub was surfacing on every run (the previous v4 actions
  targeted a Node 20 runtime for their own execution, which GitHub is
  phasing out — unrelated to what Node version our own build/test scripts
  run under).
- Worth naming plainly: this is the value of actually running the suite
  for real, which this sandbox has never been able to do. Every fix here
  came from a genuine CI failure with a full stack trace, not from
  guessing — which is a meaningfully different (and better) situation than
  the "written but never executed" state these tests were in before.

## Fix: real cards in a generated deck permanently showing as "could not be found"

- Real report: a freshly generated deck showed 14 `CARD_NOT_FOUND`
  validation errors, all for cards that had to have been real at
  generation time — `buildVerifiedGeneratedDeck` only ever accepts card
  IDs that were present in the candidate pool it was given, so a
  genuinely invented ID could never have reached the saved deck in the
  first place.
- Found two compounding issues while tracing it:
  1. **Candidate cards gathered for AI features (both review and
     generation) were never written to the card cache.** Every other path
     in the app that fetches cards from the provider (the main search
     route, single-card lookups) writes results to `card_cache` as a
     matter of course — candidate-gathering was the one place that never
     did. This meant a freshly generated deck's cards had *zero* cache
     coverage: every single subsequent page load depended on a live
     re-resolution succeeding perfectly, forever, for every card in the
     deck, with no cached fallback if it didn't. Fixed by caching
     candidates as they're gathered, in both `gatherCandidateCards` (AI
     review) and `gatherDeckGenerationCandidates` (AI deck generation).
     This alone likely accounts for most of the actual failure — once
     cached, re-resolution never needs to hit the provider again for
     those specific cards at all.
  2. **The batch card-lookup query was a single unbounded OR clause over
     every requested ID at once** (`id:a OR id:b OR id:c ...`). A
     generated deck can easily need 20-40+ distinct IDs resolved in one
     call. A single large OR query is exactly the shape of request that
     can silently lose a subset of clauses under some provider-side
     limit — no error, just fewer results than requested, which is
     indistinguishable from "these specific cards don't exist" once it
     reaches the validator. Fixed by chunking `getCards` into batches of
     20 IDs, and — as a second layer of defense — falling back to an
     individual single-card lookup for any ID that still doesn't come
     back from its batch, before giving up on it.
- Added diagnostic logging in `resolveDeckCards` (the shared resolution
  path used by every deck view/edit/validate) for any IDs that remain
  unresolved after both the cache and the (now more robust) live lookup,
  so a future recurrence — of this or a different underlying cause — shows
  up immediately in Vercel's logs with the specific IDs involved, rather
  than requiring another round of hypothesis-and-guess.
- Didn't add a unit test for the batch-chunking change specifically: it's
  real network I/O (`fetch`) inside `pokemonTcgApiProvider`, the same
  category as `searchCards`/`getCard`, neither of which has ever had a
  direct unit test in this codebase — only the pure functions alongside
  them (`normalizeCard`, `buildSearchQuery`, `extractPrice`) do. Kept that
  existing boundary rather than bolt on fetch-mocking for one method.

## AI Deck Assist redesign — implemented per the approved brief

Full rebuild of the AI deck generation pipeline from single-shot generation
to plan -> compile -> score -> refine, per the separately-authored and
user-approved redesign brief. Summary of what changed (see the brief
itself for the full reasoning behind each decision):

- **Archetype-specific quality profiles** (`archetype-profiles.ts`) —
  four grounded threshold profiles (aggro/control/mill/other), not a
  single flat table. Mill in particular needs a genuinely different shape
  (8-12 Pokémon, 34-42 Trainer, 7-11 Energy) than the other three — a real
  finding from research, not an assumption, and confirmed by a test that
  specifically proves the mill and default profiles disagree about the
  same deck.
- **Deterministic quality scoring** (`deck-quality.ts`) — 7 hard checks
  (composition ranges, draw/search minimums, Basic Pokémon minimum,
  Energy-type-vs-attack-cost coverage) and 4 soft/informational checks
  (evolution depth, attacker redundancy, retreat-cost coverage, multi-prize
  balance), all computed from the existing `computeDeckStatistics` engine.
  Deliberately not `server-only` — it's a pure function, reused unchanged
  on both the server (during generation/refinement) and the client (live
  in the deck editor), so quality feedback isn't limited to freshly
  generated decks.
- **Two-stage AI pipeline**: a cheap strategy-plan call
  (`plan-prompt.ts`/`plan-schema.ts`, working from a candidate *pool
  summary* — counts by role, not full card data, to keep this stage
  cheap) followed by a compilation call scoped to that plan
  (`generation-prompt.ts`, reworked to accept an optional `plan` and an
  optional `refinement` payload rather than improvising a full shape from
  scratch every time).
- **One bounded refinement pass**: if the compiled deck fails any hard
  quality check, exactly one more compilation call runs, given the
  specific numeric gaps as feedback (e.g. "6 Trainers are draw support;
  this archetype wants at least 8"). The refined attempt is kept
  regardless of whether it fully passes afterward — per the approved
  decision, a deck that still has issues is saved with them shown, never
  blocked or discarded.
- **`AI_DECK_GENERATION_LIMIT_PER_DAY` default lowered from 3 to 2** — a
  single "generate" click is now 2-4 AI calls instead of 1, so the daily
  budget needed adjusting to reflect the real cost per generation, per the
  brief's own flag on this tradeoff. Still one rate-limit count per click,
  not per internal AI call.
- **Manual composition override (brief section 5b) is not yet built** —
  the brief was approved in full, but this implementation pass covered the
  core plan/compile/score/refine pipeline first. The override UI, its
  validation (sum-to-exactly-60), and its plumbing into the plan prompt
  and quality-check tolerance are a follow-up, not forgotten.
- Both provider adapters (`anthropic.ts`, `openai.ts`) now implement
  `planDeck` alongside `generateDeck`, following the exact same
  instructions/shape-separation discipline established for every other
  prompt in this app (a lesson learned the hard way in Phase 7 — see the
  "strengths as a string" fix above), applied correctly from the start
  here rather than needing a follow-up fix this time.
- A real TypeScript closure-narrowing gap was caught and fixed while
  wiring `generation-service.ts`: a `const` checked non-null earlier in
  the function doesn't stay narrowed inside a nested closure defined
  later, even though it can't have been reassigned. Fixed by re-binding
  to a fresh `const` immediately after the null check, before any closure
  could reference the original narrowed variable incorrectly.

## Fix: remaining e2e failure was a bad test assertion, not an app bug

- 17 of 18 e2e tests passed in the latest CI run — real progress from the
  first run. The one remaining failure (`ai-review-flow.spec.ts` — "shows
  suggested swaps with real card names") turned out to be a flawed
  assertion, not an app bug: the test's mocked deck has exactly one card,
  named "Trainer A" — the same name used for the swap's "remove" side. The
  assertion `getByText("Trainer A", { exact: true })` was therefore
  trivially satisfied by the deck list's own entry, regardless of whether
  the swap section had rendered at all. It proved nothing about the thing
  the test was actually meant to verify.
- Confirmed this by cross-checking against the *other* test in the same
  file ("applying a swap can only be actioned once"), which passed and
  exercises the identical swap structure via the "Apply this swap" button
  — proof the swap section genuinely does render correctly. The failure
  was isolated to the text assertion's scoping, not the feature.
- Fixed by: waiting for the "Apply this swap" button first (a
  swap-section-specific element, unlike a card name that might coincide
  with something already on the page) before checking any text, and
  scoping the name assertions to the swap's own list item
  (`page.locator("li", { hasText: "Better consistency." })`) rather than
  searching the whole page — so "Trainer A" can only match inside the
  swap section itself, not anywhere else it happens to appear.

## Fix: swap card names weren't wrapped in their own element (root cause, one layer deeper)

- The previous fix scoped the failing test's assertion to the swap's own
  list item, which correctly exposed a real markup gap rather than fixing
  a broken test: "Trainer A" and "Trainer B" inside `SwapCardGroup` were
  rendered as bare text nodes, siblings to the count/sign span (`−4×
  Trainer A`), never wrapped in an element of their own. There was
  genuinely no element in the swap section whose exact text content was
  just the card name — so the original, unscoped test assertion had
  *always* been matching the deck list's own card entry, never the swap
  section at all, for both this fix and the one before it.
- Fixed at the source: wrapped the card name in its own `<span>` in
  `SwapCardGroup` (`DeckReviewPanel.tsx`). This is a genuine small
  improvement beyond just fixing the test — a distinct element per piece
  of text is also cleaner for assistive tech than one blended text node
  combining a symbol, a count, and a name.
- Checked the sibling `CardChip` component (used for strengths/issues
  evidence elsewhere in the same file) for the same issue — it doesn't
  have it, since its button's only text content is already the card name
  alone, nothing else concatenated alongside it.
