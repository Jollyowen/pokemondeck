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

## Change: search is now explicit, not real-time-on-every-keystroke

- Prompted by a direct question about API usage: confirmed by reading the
  actual code (not from memory) that both the `/cards` catalogue and the
  deck builder's "Add cards" pane fired a live request to the *external*
  Pokémon TCG API (1) immediately on page load with zero filters — i.e.
  silently browsing the entire catalogue before anyone asked for
  anything — and (2) on every debounced keystroke while typing a name.
  `/api/cards` never caches the search itself (only writes individual
  cards to cache *after* a search, for later single-ID lookups), so every
  one of these was a real live call to a rate-limited third party, not a
  local operation.
- Changed to an explicit search model: filter/name changes update local
  "draft" state only (bound to the form) and never fire anything by
  themselves. A new `onSubmit` on `CardSearchFilters` (a proper `<form>`
  now, with a Search button) is the only thing that triggers a fetch —
  Enter key or the button, both pages, matching behaviour. No fetch at all
  happens until the first explicit search; both pages show a plain prompt
  state ("Search or filter to see cards") instead.
- Scope decision made without further discussion, since it wasn't
  explicitly specified: *all* criteria (name typing and dropdown
  selections alike) are gated behind the same explicit Search action, not
  just the name field. Reasoning: having dropdowns behave differently from
  the name field (instant vs. gated) would be a more confusing, less
  predictable model than one consistent rule — "adjust your criteria, then
  search" — even though dropdown selections are individually cheaper than
  a stream of keystrokes.
- Pagination (Next/Previous) is unaffected and still works without
  re-submitting — it reuses the last submitted search's criteria via a
  separate `activeSearch` snapshot, only the page number changes.
- The format toggle remains fully instant, unaffected by any of this —
  it was never sent to the API in the first place (legality display is
  purely a client-side filter over whatever's already loaded), so there
  was never a request to gate there.
- **Deliberately untouched**: the AI deck generator's Pokémon-name
  autocomplete (`AiDeckGeneratorForm.tsx`) keeps its own independent
  real-time debounced behaviour. It's a fundamentally different, much
  cheaper interaction (a handful of name suggestions to prevent a typo,
  not full card browsing) — an autocomplete that only responds to a
  button press wouldn't really be an autocomplete. It doesn't use
  `CardSearchFilters` at all, so this change doesn't touch it even
  incidentally.
- Updated the 6 e2e tests that implicitly depended on the old
  auto-search-on-load behaviour (5 in `card-search.spec.ts`, 1 in
  `deck-creation-flow.spec.ts`) to explicitly click Search before
  asserting on results, matching the new real interaction.

## Refinement: dropdown filters stay instant, only the name field is gated

- Follow-up to the search-on-submit change above. Splitting the two
  wasn't arbitrary — reasoning given was that dropdown selections are a
  useful, low-cost way to immediately confirm a typed name actually
  matches something real, since there's no fuzzy matching to lean on
  otherwise. Reverted dropdowns (card type, energy type, set, rarity)
  back to firing an immediate search on selection; the name field still
  only searches on explicit Enter/Search.
- Implementation note: `onSubmit` now optionally accepts an override
  filter state (`onSubmit(overrideFilters?: CardFilterState)`), and the
  dropdowns call it directly with the freshly-computed next state rather
  than relying on the parent's `value` prop having already re-rendered by
  the time the search fires. Calling `onChange` then immediately reading
  back `value` in the same synchronous handler would have used a stale
  snapshot, since React state updates aren't reflected until the next
  render — passing the exact new state explicitly sidesteps that
  entirely, rather than working around it with an effect or a ref.

## Local card database + weekly sync (per the approved local-card-database-brief.md)

Full replacement of the "hit the live provider on every search" model
with a locally-synced mirror of the catalogue, per the separately
authored and approved brief. Summary — see the brief itself for the
full reasoning behind each decision:

- **New tables**: `cards` and `sets` (migration `0010`), with typed,
  indexed columns for everything actually searched/filtered on
  (name, supertype, types, set, rarity, legalities) and a `details` jsonb
  column for everything else (attacks, abilities, rules text, price,
  image URLs — the last of which stay as URL strings, not files, so
  there was never really a size cost to "keeping" them, contrary to the
  original framing of that question).
- **Real fuzzy search, finally**: a `pg_trgm` trigram index on `cards.name`
  makes `ILIKE '%term%'` genuinely fast — substring matching anywhere in
  a name, not just the provider's prefix-ish matching. This directly
  closes the "no fuzzy search" gap that was the whole reason dropdown
  filters mattered so much for confirming a typed name.
- **`card_cache` retired entirely**, not kept alongside the new tables —
  same migration that creates `cards`/`sets` also drops it. It was a
  reactive, partial cache (only ever populated by whatever had happened
  to be searched or viewed); keeping it running in parallel with a
  proactively-synced, comprehensive local mirror would mean two
  "cached card data" sources with different freshness guarantees, which
  is exactly the kind of thing that causes confusing bugs later, not a
  reason to hedge. Every call site that used it
  (`/api/cards`, `/api/cards/[id]`, `/api/sets`, the card detail page,
  `resolveDeckCards`, AI candidate gathering) was rewired to the new
  repository — checked with a full repo-wide grep afterward to confirm
  zero remaining references before deleting the old module, not just
  hoped.
- **Provider module split**: `pokemon-tcg-api.ts` carries `import
  "server-only"` specifically to stop it from being bundled into
  client-side JS — a real concern for the app, but it turned out to
  unconditionally throw when imported from a plain standalone script too
  (confirmed by actually running the sync script and hitting the error,
  not assumed), which would have broken the sync script entirely. Fixed
  by splitting the guard-free, reusable logic (the `createPokemonTcgApiProvider`
  factory, request/response normalization, types) into
  `pokemon-tcg-api-core.ts` with no `server-only` guard, while
  `pokemon-tcg-api.ts` becomes a thin re-export plus the app's own
  `server-only`-guarded singleton. No behavior change for the app itself
  — every existing import path still works exactly as before — but the
  sync script can now import the core factory directly.
- **Sync runs from GitHub Actions, never a Vercel route**: a full
  catalogue sync (every set, every card, paginated) is too slow for a
  typical serverless function's execution limit; GitHub Actions jobs have
  a far more generous budget by default. `scripts/sync-cards.ts` is a
  standalone script (`npm run sync-cards`), deliberately NOT reusing
  `src/lib/supabase/server.ts` or `local-card-repository.ts` directly —
  both depend on `getServerEnv()`, which validates the app's *entire*
  environment (every AI key, every other secret), not just the three
  values the sync script actually needs. It builds its own minimal
  Supabase client and calls the shared, dependency-free row-mapping
  functions (`card-row-mapping.ts`) directly instead.
- **Weekly schedule + manual `workflow_dispatch` trigger.** Weekly, per
  explicit confirmation — new sets release roughly quarterly, so this is
  generous without being wasteful. The manual trigger isn't a nice-to-have:
  the local tables start genuinely empty on first deploy, and nothing
  else populates them until a sync actually runs — waiting for the
  schedule would mean up to a week of an empty catalogue otherwise.
- **Three GitHub Actions secrets needed**, not two — worth flagging
  clearly since the original brief only named
  `POKEMON_TCG_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY`.
  `NEXT_PUBLIC_SUPABASE_URL` is also required (the sync script needs to
  know which Supabase project to write to) and isn't sensitive on its own,
  but GitHub Actions has no access to Vercel's env vars regardless, so it
  still needs entering as a secret (or a plain workflow variable — used a
  secret here for consistency with the other two rather than mixing
  conventions).
- **Name field reverted to real-time (debounced) search, dropdowns stay
  instant** — per explicit confirmation once the local mirror existed.
  The entire reason the name field was gated behind an explicit Search
  press was hitting a slow, rate-limited external API on every keystroke;
  that reason is gone once search reads from a local, fast database
  instead. Implemented as a 350ms-debounced auto-search inside
  `CardSearchFilters` itself (shared by both the catalogue and the deck
  builder's search pane), with an explicit first-render guard so landing
  on either page still doesn't fire a search before anyone's typed
  anything — the "don't search on mount" fix from the previous round of
  changes stays intact, only the "wait for an explicit click" part of it
  was reverted.
- **Genuinely faster AI deck generation as a side effect, not the main
  goal**: candidate gathering (`gatherCandidateCards`,
  `gatherDeckGenerationCandidates`) does many searches per request
  (evolution line lookups, same-type support, staple Trainer lookups) —
  all of these now hit the local database instead of a rate-limited live
  API, for free, without any changes to that code's own logic beyond
  swapping which search function it calls.

## Fix: sync script hit the API's rate limit and aborted partway through

- Real failure from the first actual run: succeeded for 5 sets, then a
  `500` from the provider aborted the entire script, having synced only
  5 of 174 sets. A `500` rather than a clean `429` made it easy to
  suspect something else, but checking the API's actual documentation
  confirmed a real, previously-unaccounted-for constraint: **authenticated
  requests are capped at 30/minute**. The sync script fired every request
  back-to-back with zero delay between them — a real gap in the original
  design, not bad luck.
- Fixed with three layered changes to `scripts/sync-cards.ts`:
  1. **Fixed pacing** — a 2.5s delay after every request (~24/minute),
     comfortably under the documented cap with headroom left for retries
     without tipping back over it.
  2. **Retry with exponential backoff** (up to 4 attempts, 2s/4s/8s
     backoff) for any `PokemonTcgApiError` — absorbs a transient
     rate-limit blip or momentary server error instead of treating the
     first failure as fatal.
  3. **Per-set resilience** — a set that still fails after all retries is
     logged and skipped, not treated as a reason to abort the other 170+
     sets. Every upsert is idempotent, so re-running the sync (or letting
     the next scheduled run happen) naturally picks up anything missed
     without re-doing or duplicating what already succeeded. The script
     still exits non-zero if anything was skipped, so the GitHub Actions
     run correctly shows as failed and prompts a retry — it just doesn't
     throw away partial progress to do so.
- **Real tradeoff worth naming**: a full sync now takes roughly 8-12
  minutes instead of under a minute, deliberately. Reliability over speed
  — this runs unattended on a schedule, so a slower sync that actually
  completes is worth far more than a fast one that reliably falls over
  partway through. GitHub Actions' default 6-hour job timeout leaves huge
  margin regardless.

## UI/UX redesign, batch 1: card search on landing/decks page + deck stack thumbnails

Requested as a five-part UI/UX batch (functionality was already solid).
Building in three staged groups per the user's confirmed order: this is
the first (items 1–2 of 5).

- **Card search on the landing/decks screen**: factored the `/cards`
  page's entire search/filter/results/pagination block out into a
  reusable `<CardBrowser />` component, rather than duplicating that
  state logic. `/cards` itself now just renders it (no behaviour change —
  confirmed via the existing build/lint/test/typecheck pass). Embedded on
  the empty-state landing page (`/`) and below the deck list on `/decks`,
  both per the request that this "can be shown below the list of user
  decks."
- **Deck stack thumbnails need a "main card" concept that didn't exist.**
  Rather than infer one (e.g. highest-quantity Pokémon), explicitly asked
  and the user wants it user-specified. Added `mainPokemonCardId` to the
  `Deck` type end to end: migration `0011_decks_main_pokemon_card_id.sql`
  (plain nullable text column, no FK — same loose-reference convention as
  `deck_cards.card_id`, since card ids live in the locally-synced `cards`
  table, not something `decks` has ever referenced directly), repository,
  Zod schema, the `PATCH /api/decks/:id` route, and a new "Main Pokémon"
  dropdown in the deck editor (populated from Pokémon currently in the
  deck, autosaved the same way as every other editor field). Carries
  across duplicate and shared-deck copy, same pattern as
  `strategyArchetype`/`strategyNotes`. Auto-clears if that specific card
  is later removed from the deck, rather than silently pointing at a card
  no longer present.
- **`listOwnedDecks` now also resolves, in one batched pass**: the main
  Pokémon's small card image (for the thumbnail) and an `energyTypes`
  array — the deck's Pokémon elemental types, ordered by how many cards
  carry each (most-represented first), for the stacked type-icon order.
  A dual-type Pokémon counts toward both types, same convention already
  used by `computeDeckStatistics`. All card lookups for a given deck list
  page batch through a single `getLocalCards` call (deduplicated ids
  across every deck being listed) rather than a query per deck.
- **Deck stack visual**: `DeckStackThumbnail` renders the chosen main
  card on top with two purely decorative, fixed-offset card-backs behind
  it (no data, never dynamically pulled in, per the request) to suggest a
  full stack. Falls back to a plain "No main Pokémon set" placeholder
  card when nothing's been chosen yet or the deck is empty.
- **Energy-type icons**: `EnergyTypeIcon`/`EnergyTypeStack` are a
  deliberately original abstract design (colour + single-letter
  monogram), not a reproduction of the official TCG energy symbols,
  which are Nintendo/The Pokémon Company IP — same reasoning already
  applied elsewhere in this app to avoid third-party IP.
- **Icon-only deck actions**: Open/Rename/Duplicate/Delete are now inline
  SVG icon buttons (`DeckActionIcons.tsx`) with both a `title` (mouse
  hover) and an `aria-label` carrying the full action + deck name (e.g.
  "Duplicate Charizard EX"), rather than relying on visual icon shape
  alone for meaning — screen readers and hover tooltips both get the full
  text, not an abbreviation.
- **Layout**: switched from a single-column deck list to a responsive
  card grid (1–4 columns depending on viewport). Deliberately avoided any
  fixed-height/overflow-hidden container on the name, badges, or date row
  — text wraps rather than truncates, per the explicit "don't crop any
  info or cut words off" requirement.
- Verified: `tsc --noEmit` clean, `eslint` clean (0 warnings), all 140
  existing unit tests still pass unchanged, and a full production build
  succeeds.
- **Not yet done** (next two batches, per the user's confirmed staging):
  evolution-line grouping and Trainer subtype splitting in the deck
  editor, the card overlay's Set/energy-type additions, and the print
  deck feature.


## Fix: unapplied migration made existing decks look wiped, not just missing a column

- Real report right after shipping the UI/UX batch-1 deliverable: "my
  existing decks are no longer showing." Nothing was actually deleted —
  `listOwnedDecks` selects `main_pokemon_card_id` explicitly (added for
  the deck-stack thumbnail feature), and until migration `0011` is
  actually applied to the live database, that query errors. The bug: the
  code destructured `{ data: deckRows }` and ignored `error` entirely,
  so a failed query silently became `[]` — indistinguishable from "this
  owner genuinely has zero decks," which is exactly what made this look
  like data loss rather than a pending migration.
- Fixed in `listOwnedDecks` by checking `error` and throwing (after
  `reportError` logging) rather than falling through to an empty array —
  a schema mismatch or any other query failure now surfaces as a real
  500 with a diagnosable log line, not a deceptively-empty deck library.
  `getSharedDeckByToken` (same explicit-column-list shape, also touched
  by migration 0011) gets the same `reportError` logging, but
  deliberately keeps returning "not found" rather than throwing — it's a
  public endpoint, so a query failure and a genuinely revoked/missing
  share token should look identical to the requester either way; only
  the server log needs to be able to tell them apart.
- Didn't add a mocked-Supabase unit test for this — same reasoning as
  the Phase 8 "deliberately not covered by an automated test" note:
  faking `.from().select().eq()...` chains to simulate a query error
  would mostly prove the mock was called correctly, not that the real
  error-surfacing logic works.
- **Process note for next time**: this should have been called out
  explicitly as a "run this migration before deploying" step when the
  batch-1 deliverable was handed over (the way earlier phases in this
  file do, e.g. Phase 7's `0006_deck_reviews_owner_id.sql` note) — it
  wasn't, and that's a real gap in how that handover was written up, not
  just a database step the user forgot.

## UI/UX redesign, batch 2: evolution-line grouping, Trainer subtype split, card overlay additions

Second of three staged groups from the five-part UI/UX batch (items 3–4 of 5).

- **Evolution-line grouping and Trainer subtype split are both pure
  functions** (`src/lib/deck/deck-card-grouping.ts`,
  `groupPokemonByEvolutionLine` / `groupTrainersByCategory` /
  `trainerCategory`), written and covered by 14 unit tests before being
  wired into `DeckCardList` — same discipline as every other
  correctness-sensitive pure function in this app (the swap verifier,
  the generation verifier).
- **Evolution grouping is by card name, not card id.** `evolvesFrom` /
  `evolvesTo` are names, and grouping needs to work the same whether a
  deck has one printing of a Pokémon or several — multiple printings of
  the same name collapse into a single node in the tree rather than each
  starting its own line. A Stage 1/2 whose earlier stage isn't in the
  deck at all becomes a root of its own line rather than being dropped,
  since there's nothing to nest it under.
- **Trainer subtype split**: reads directly off `card.subtypes`, which
  the provider already supplies (Item/Supporter/Stadium/Pokémon
  Tool/ACE SPEC) — no new data needed. ACE SPEC is checked first, ahead
  of whatever other subtype the card also carries (e.g. an ACE SPEC Item
  still shows under ACE SPEC, not Item), since the brief calls it out as
  its own bucket. An "Other" bucket catches anything that doesn't match
  one of the five named categories, so no Trainer card can silently
  vanish from the list if a future/unusual subtype string shows up.
  Empty buckets aren't rendered.
- **`DeckCardList` refactor**: factored the per-entry row markup
  (image, add/remove controls, evolution-suggestions disclosure) into a
  single `DeckCardRow` component reused by the Pokémon tree, every
  Trainer subcategory, and the Energy list — previously this markup was
  written once for a single flat list; duplicating it three ways instead
  of factoring it out would have made the three groupings drift out of
  sync over time.
- **Nesting is visual only** (left border + indentation per depth level)
  — deliberately didn't add a text label like "evolves from X" on each
  child row, since the indentation and grouping already convey the
  relationship structurally and a static label risked being more
  confusing than informative once multiple branches (e.g. Eevee's
  evolutions) are involved.
- **Card overlay additions**: `CardImageModal` now shows the card's name,
  `Set: <setName>`, and its elemental type(s) as the same
  `EnergyTypeStack` icon used on the deck-library thumbnails, in an info
  bar below the image — reuses the existing icon component rather than a
  second implementation. Non-Pokémon cards (Trainer/Energy) simply show
  no type icons, since `card.types` is empty for them.
- Verified: `tsc --noEmit` clean, `eslint` clean (0 warnings), 154 unit
  tests pass (140 previous + 14 new), full production build succeeds.
- **Not yet done** (final batch): the print-deck feature (simple grouped
  list page, then a full-art grid across A4 sheets with per-card
  quantity badges instead of duplicate images).

## UI/UX redesign, batch 3 (final): print deck

Last of three staged groups from the five-part UI/UX batch (item 5 of 5).

- **New route, not a modal**: `/decks/[id]/print` rather than an in-page
  print overlay — a dedicated route means the browser's native print
  dialog (`window.print()`) operates on a page containing only the
  printable content, with the app's header/footer/nav hidden via
  Tailwind's `print:hidden` rather than needing a separate print
  stylesheet to fight the app chrome.
- **Reuses the existing grouping functions** (`groupPokemonByEvolutionLine`,
  `groupTrainersByCategory`) from batch 2 rather than writing new
  grouping logic for print — "grouped in the same way as the deck is"
  is satisfied by construction, not by keeping two groupings in sync by
  hand. The evolution tree is flattened depth-first (Basic before its
  evolutions) for the printed list, since nested indentation doesn't
  carry the same value on a static printed page that it does as an
  interactive disclosure.
- **Page 1 list includes quantity**, even though the brief's literal
  wording ("Name, Energy type, Set title") didn't list it — a decklist
  without a copy count isn't usable as an actual decklist. Flagging this
  as a deliberate addition of my own judgment, not a literal reading of
  the spec.
- **16 cards per page (4×4 grid)**, per explicit confirmation — closer to
  real card size than 9, fewer pages to print.
- **Never duplicates an image for multiple copies**, per the brief: the
  full-art grid is built from one tile per unique card id (quantity
  already collapsed by the deck's own `deck_cards` schema), with a
  `×N` badge overlaid when quantity > 1, rather than repeating the same
  image N times.
- **Art grid ordering matches the list page's ordering** (Pokémon →
  Trainer subcategories in the same fixed order → Energy) so a person
  cross-referencing the two pages doesn't have to hunt for a card.
- **`@page { size: A4; margin: 12mm }`** added directly to `globals.css`
  inside a `@media print` block — the one piece of print styling
  Tailwind's `print:` variant doesn't reach, since Tailwind utilities
  style elements, not the page box itself.
- **Cards with no resolved image are skipped from the art grid** but
  still appear on the list page with a "Not found in catalogue" note —
  consistent with how unresolved cards are already surfaced elsewhere in
  the deck editor, rather than silently vanishing from the printout.
- Verified: `tsc --noEmit` clean, `eslint` clean (0 warnings), all 154
  existing unit tests still pass unchanged (no new pure-function logic
  introduced here worth a dedicated unit test — grouping itself is
  already covered by batch 2's 14 tests), full production build
  succeeds, and a dev-server smoke test confirms the route renders
  without crashing.
- This closes out all five items of the original UI/UX request.

## Fix: deck library page crashed on render, taking all four deck-library e2e tests down with it

- Real CI failure right after the UI/UX batch-1 deliverable: 4 of 5
  `deck-library.spec.ts` tests failed, three of them on
  `getByRole("link", { name: "Charizard Control" })` never appearing at
  all, one on a 30s timeout waiting for the "Rename" button. The
  `[WebServer] Fast Refresh had to perform a full reload due to a runtime
  error` line in the log was the real signal — this wasn't 4 independent
  test problems, it was one client-side crash taking the whole page down
  with it.
- **Root cause**: `/decks/page.tsx` reads `deck.energyTypes.length`
  unconditionally for the type-icon stack. The e2e tests' `deck()` mock
  fixture predates the batch-1 `energyTypes`/`mainPokemonImageSmall`
  additions to the deck-list API response, so the mocked payload simply
  doesn't have that field — `energyTypes` is `undefined`,
  `.length` throws, React unmounts, nothing after that point in the page
  ever renders. Every other assertion failure was downstream of this one
  throw.
- **Fixed two ways, deliberately**: (1) the page itself now defaults
  `deck.energyTypes ?? []` and `deck.mainPokemonImageSmall ?? null`
  rather than assuming the API always sends them — a render should
  degrade to "no icons shown" on an unexpected/older payload shape, never
  crash outright. (2) the e2e fixture was also updated to include the
  real current fields (`mainPokemonCardId: null, mainPokemonImageSmall:
  null, energyTypes: []`), since a mock that no longer matches the real
  API response shape is itself a latent bug in the test, not just in the
  app. Both fixes are kept, not just one — the defensive client code and
  the accurate fixture are protecting against different failure modes
  (a genuinely stale/partial API response vs. a test that's drifted from
  reality).
- **Second, independent bug found while fixing the first**: once the
  crash is fixed, `getByRole("link", { name: "Charizard Control" })`
  would have started failing a different way — Playwright's default
  substring name matching means it now matches *two* links: the deck
  title itself, and the new "Open <deck name>" icon-button link added in
  the same batch, whose accessible name (`"Open Charizard Control"`)
  contains the bare deck name as a substring. Exact same strict-mode
  ambiguity shape as the `"Trainer A"` fix documented earlier in this
  file. Fixed the same way: `{ exact: true }` on the title-link
  assertions specifically (the Rename/Delete/Undo button assertions
  don't need it — "Rename"/"Delete"/"Undo" aren't substrings of any other
  accessible name on the page).
- Could not run the actual Playwright suite in this sandbox to confirm
  green (same pre-existing browser-download-blocked-by-network-allowlist
  limitation noted in earlier phases) — fixed by direct code inspection
  of both the crash site and the resulting DOM shape, not by guessing.
  `tsc`, `eslint`, all 154 unit tests, and a full production build all
  pass. Worth treating the next real CI run as the actual confirmation,
  the same way the Phase-8-era e2e fixes in this file were.

## Fix: rename e2e test broke because /decks now has a second textbox

- Real CI result after the previous fix: 17/18 passed. The one remaining
  failure — `locator.fill: strict mode violation: getByRole('textbox')
  resolved to 2 elements` — was a genuinely different bug from the batch
  of e2e fixes just made, not a leftover of them.
- **Root cause**: the rename test's `page.getByRole("textbox")` was never
  scoped to begin with; it worked only because the rename input used to
  be the only textbox on `/decks`. Batch 1 added the `<CardBrowser />`
  search box below the deck list on that same page, which also renders a
  `getByRole("textbox")`-matching `<input>` (`aria-label`/placeholder
  "Card name"). Once both exist, an unqualified `getByRole("textbox")` is
  ambiguous by construction — Playwright correctly refused to guess.
- **Fixed in the test, not the app**: scoped to
  `getByRole("textbox", { name: "Rename Charizard Control" })`. Unlike
  the `SwapCardGroup` card-name bug this looks superficially similar to,
  there was no markup gap here to fix — the rename input already had a
  distinct, correct `aria-label`. The lesson (don't leave a locator loose
  enough to match something it doesn't mean to) is the same; where the
  fix belongs differs based on whether the accessible name actually
  exists and is just not being used (this case) or genuinely doesn't
  exist yet (the `SwapCardGroup` case).
- Also confirmed the `[WebServer] Failed to look up shared deck by token`
  log line seen in this CI run is expected, not a new regression — it's
  the `reportError` logging added for the earlier migration-column bug,
  firing because CI's Supabase env vars are placeholders so the lookup
  genuinely errors; the endpoint still correctly falls through to its
  "not found" response either way, and the test that log line appears
  under passes.

## Change: energy type icons replaced with user-supplied artwork

- Swapped `EnergyTypeIcon`'s rendering from the original abstract
  letterform badges (deliberately non-reproducing of official TCG
  symbols, per that component's original design note) to 11 PNG icons
  supplied directly by the user, stored in `public/energy-icons/`.
- File names use the app's own type vocabulary (`grass.png`,
  `lightning.png`, `darkness.png`, etc.), matching TCGdex's `Types`
  union exactly, so no per-type mapping table beyond a lowercase lookup
  was needed.
- Flagged once to the user before making this change: the supplied
  icons closely resemble the official Pokémon TCG energy symbols, which
  are Nintendo/The Pokémon Company IP — the original badges were built
  as originals specifically to avoid that. Proceeding was the user's
  explicit call on their own uploaded assets, not a design decision made
  here.
- `energyTypeStyle` (the old bg/fg/label lookup) was removed entirely —
  confirmed via repo-wide grep that nothing outside `EnergyTypeIcon.tsx`
  imported it directly; every other consumer only used the exported
  `EnergyTypeStack`/`EnergyTypeIcon` components, so no other file needed
  changes.
- Falls back to a plain "?" badge for any type string that doesn't match
  one of the 11 known types, rather than a broken image reference.
- **Post-deploy bug, not a code bug**: the rewritten component initially
  didn't appear live because it was built from a separate zip upload
  that never got merged with the TCGdex-migration branch of work — the
  actual file overwritten in the deployed repo was still the old
  abstract-badge version. Root cause was a process gap (full-tree zip
  overwrites from divergent starting points), not a bug in either
  change individually. Resolved by consolidating both branches of work
  into one tree before this zip.

## Fix + additions: deck cost on library view, search-tile consistency, deck-row info stacking, Energy-type filter gap

- **Deck library cost**: `listOwnedDecks` now computes `estimatedValue`
  server-side via the same pure `computeEstimatedDeckValue` function the
  deck editor already uses — no new query, since the function's needed
  card data (`cardById`) was already being resolved there for the
  energy-type stack. Shown next to status/format/card-count on
  `/decks`; a `+` suffix (matching the editor's own existing convention)
  signals the total is a floor, not exact, when some cards have no
  price data.
- **Deck library layout**: deck name moved above the thumbnail per
  request; no other reordering.
- **`AddCardTile` (deck builder's search pane) now shows set name** —
  it already showed price but not set, while the standalone `/cards`
  catalogue's `CardTile` already showed both. Brought the two in line.
- **Deck editor row info (Set / Energy type / Rarity) no longer shares
  one truncated text line.** At deeper evolution-line indentation
  levels the available width shrinks, so most of that line was getting
  cut off. Now: set name on its own line, then type/rarity/price as
  separate wrapping chips (flex-wrap) so they stack onto additional
  lines instead of disappearing. Price is included in that chip row
  too, not appended to the old single line.
- **Energy-type search filter bug, found from a real reported result
  set**: `types.contains([type])` alone missed many Basic/Special
  Energy cards, because a meaningful number of them have an EMPTY
  `types` array in the underlying data (confirmed directly — a "Basic
  Water Energy" printing, `sve-3`, has `types: []`) even though the
  card is unambiguously that type by name. Fixed by broadening the
  filter for `supertype === "Energy"` specifically: match either
  `types` containment OR a name substring match on the type word (how
  every basic/special energy card is actually named), via `.or()`.
  Non-Energy supertypes are unaffected — Pokémon cards' `types` field
  is reliably populated, so the stricter containment-only filter stays
  as-is for them.
  - Not yet confirmed whether this same `types: []` gap exists in
    freshly-TCGdex-synced Energy rows specifically, or only in the
    older pokemontcg.io-era rows still sitting in the local database at
    the time this was diagnosed (both example cards in the bug report
    showed `"provider": "pokemon_tcg_api"`, suggesting the table may
    not have been fully re-synced under TCGdex yet). The name-fallback
    fix is deliberately provider-agnostic so it holds either way, but
    worth revisiting once a confirmed-TCGdex-sourced dataset is in
    place, in case TCGdex's own Energy-card `types` data turns out to
    be more complete and this fallback becomes redundant (harmless
    either way, just extra query complexity if so).

## Bug found while investigating "duplicate sets" / suspected stale data

- Started from a real user report: the `sets` table appeared to contain
  duplicates, taken as a sign that old pokemontcg.io-era rows were still
  sitting alongside newly-synced TCGdex rows. Investigating this
  surfaced an actual, unrelated bug that undermines the exact evidence
  being used to diagnose it:
- **`rowToCard` unconditionally hardcoded `provider: "pokemon_tcg_api"`**
  on every read from the local database, regardless of which provider
  actually wrote that row. `CardRow` never had a `provider` column at
  all — the field was invented at read time, not stored. This means
  **the `provider` value in any card fetched from `/api/cards` since
  the TCGdex migration was never reliable evidence of anything** — even
  a card correctly overwritten by a completed TCGdex sync would still
  report `pokemon_tcg_api`. Both example cards in the original bug
  report showing `"provider": "pokemon_tcg_api"` do NOT prove they're
  stale; that field was wrong unconditionally, for every row.
- **Fixed properly**: added a real `provider` column to both `sets` and
  `cards` (migration `0012_cards_sets_provider.sql`), threaded through
  `cardToRow`/`rowToCard` (already available from `card.provider`, just
  never written) and `setToRow`/`rowToSet` (new explicit `provider`
  parameter on `setToRow`, matching the existing pattern of
  `cardToRow(card, setReleaseDate)` taking sync-context data as an
  explicit argument rather than inferring it).
- **Migration default is `'unknown'`, deliberately not
  `'pokemon_tcg_api'`**: the TCGdex migration's sync runs — even the
  ones that later crashed on the evolvesTo pass — had already completed
  their main per-set card upserts first, genuinely overwriting many rows
  with real TCGdex data before the bug fixed here ever mislabeled them
  on the next read. Defaulting to `'pokemon_tcg_api'` would have been
  just as unproven a claim as the bug itself; `'unknown'` is the honest
  label until a sync completes under the fixed code.
- **This makes the original "duplicate sets" question actually
  answerable, going forward**: after a clean sync completes under this
  fix, any `sets`/`cards` row still marked `'unknown'` is a *provable*
  leftover — something a TCGdex sync never touched — rather than a
  guess. That's the right next step for confirming (or ruling out) the
  original stale-data/duplicate-sets concern, rather than continuing to
  read a field that was never trustworthy.
- Added a regression test (`card-row-mapping.test.ts`) specifically
  using `provider: "tcgdex"` — the previous test suite only ever
  exercised `pokemon_tcg_api`, which coincidentally matched the
  hardcoded bug and so never caught it.

## Fix: image fallback consistency, and Basic Energy copy-limit false positive

- **Image fallback consistency**: `CardTile` already had a labeled "No
  image" placeholder for a missing `imageSmall`/`imageLarge`; `AddCardTile`
  and the card detail page (`/cards/[id]`) had a blank grey box instead —
  same situation, weaker feedback. Both now match `CardTile`'s pattern.
  Left `DeckCardList`'s ~40px row thumbnail and `DeckStackThumbnail`
  unchanged on purpose: the former is too small for a text label to read
  cleanly, and the latter already has its own deliberate "empty stack"
  look that doesn't need one.
- **Root cause of missing images, for the record**: not a bug — TCGdex
  genuinely doesn't have image assets for every card yet, particularly
  very recent/minor sets (confirmed against a real example: MEE, a
  tiny 8-card promotional Energy set released within the last few
  months). This self-heals as TCGdex backfills assets and the weekly
  sync picks up the update; nothing to fix in this app for that part.
- **Fix: `isBasicEnergy` false negative causing "Basic Psychic Energy
  has 17 copies" incorrectly flagged as exceeding the 4-copy limit.**
  Root cause: `isBasicEnergy` required `subtypes.includes("Basic")`,
  which depends on TCGdex's `energyType` field — the same class of gap
  already found and fixed for `types` on Energy cards (see the earlier
  "Energy-type search filter bug" entry) apparently also affects this
  field for at least some Basic Energy printings.
  - Fixed with a name-pattern fallback: every real Basic Energy card is
    named exactly "Basic `<Type>` Energy" — a standard, unambiguous
    convention across the whole TCG — so `isBasicEnergy` now also
    treats an Energy-supertype card as Basic if its name matches that
    pattern, regardless of what `subtypes` says.
  - Deliberately name-pattern-specific, not "any Energy card mentioning
    a type," so a genuine Special Energy card (Double Turbo Energy,
    Aurora Energy, etc. — correctly subject to the 4-copy limit) can't
    be swept in by the fallback. Covered by an explicit regression test
    asserting `isBasicEnergy` returns `false` for "Double Turbo Energy"
    even with an empty `subtypes` array.
  - `VALIDATION_RULES_VERSION` bumped to `1.1.0` — this changes what a
    deck's computed validation issues can be, and per this file's own
    stated convention, that needs to invalidate any AI review cached
    against the old logic.

## Fix (2): isBasicEnergy still missed plain "<Type> Energy" names

- Real report: `sve-002` "Fire Energy" (no "Basic" prefix, `subtypes:
  ["Normal"]`) still incorrectly flagged as exceeding the 4-copy limit
  after the first fix — which only matched the "Basic <Type> Energy"
  naming style. A real search sample confirmed TCGdex uses BOTH styles
  across different set eras: mostly plain "<Type> Energy" for older
  sets, "Basic <Type> Energy" for some newer ones (e.g. `sv03-230`) —
  and `subtypes` doesn't reliably say "Basic" for either style.
- Broadened `BASIC_ENERGY_NAME_PATTERN` to match both, but deliberately
  restricted the bare-word case to the 11 real elemental type names
  (`ENERGY_TYPE_NAMES`), not "any single word + Energy" — real Special
  Energy cards are also often named "<SingleWord> Energy" (Rainbow
  Energy, Aurora Energy, Capture Energy, Twin Energy), and a looser
  pattern would have wrongly exempted them. Verified against every real
  Special Energy name found in an actual TCGdex search result (Nitro
  Fire Energy, Heat Fire Energy, Unit Energy GrassFireWater, Blend
  Energy Grass Fire Psychic Darkness, Double Colorless Energy) plus the
  four single-word real Special Energy names above — none match.
- `VALIDATION_RULES_VERSION` bumped to `1.1.1`.
- **Follow-up flagged, not yet fixed**: `types: []` is empty for every
  Energy card checked in a real 34-card sample, not just some — this
  also means `EnergyTypeStack` (the type-icon UI) won't show an icon
  for any Energy card, since it reads `card.types` directly. Same root
  cause as this fix; likely wants the same name-based fallback applied
  to icon display, not validation.

## Fix: the Energy types[]/subtypes gap had spread further than the copy-limit bug

- Prompted by a direct question after the copy-limit fix: audited every
  remaining consumer of `card.types` and independent
  `subtypes.includes("Basic")` checks across the codebase, rather than
  assume `validate.ts` was the only place affected. Found four more real
  bugs, all the same root cause (TCGdex's `types` array is empty and
  `subtypes` says "Normal" not "Basic" for most real Energy cards):
  1. **`candidate-cards.ts`** (both AI review's and AI generation's
     candidate gathering) — each had its own `.filter((c) =>
     c.subtypes.includes("Basic"))` *after* an already-correctly-filtered
     search, silently discarding almost every real Basic Energy result.
     Both now use the shared `isBasicEnergy`.
  2. **`candidate-pool-summary.ts`** — two compounding bugs at once: the
     same subtype check, *and* a `for (const type of card.types)` loop
     that had nothing to iterate even if the subtype check passed. Fed
     into the AI deck generation redesign's Strategy Plan prompt, which
     almost certainly always saw `energyTypesAvailable: []` regardless
     of the real candidate pool.
  3. **`deck-quality.ts`'s `ENERGY_TYPE_MISMATCH` hard check** — the
     most serious of the four: this is one of the 7 hard quality checks
     from the AI Deck Assist redesign, and it almost certainly
     false-flagged nearly every generated deck as missing energy types
     it actually had, since `presentEnergyTypes` was built the same
     broken way. Given a hard-check failure triggers the one bounded
     refinement pass, this was likely burning real AI-call budget on
     spurious refinements.
  4. **`statistics.ts`'s `energyTypeDistribution`** — the deck editor's
     own "Energy type breakdown" stat, a core original-brief feature,
     was silently showing nothing for a deck's actual energy makeup.
  5. **`review-cards.ts`'s `toDeckReviewCard`** — sent `types: []` to
     the AI review model for a card literally named "Fire Energy,"
     leaving the model to infer type from the name unassisted rather
     than the app supplying it reliably.
- Added a new shared, exported helper — `inferBasicEnergyType` in
  `validate.ts` — reusing the same name-parsing logic and restricted
  type-name list as `isBasicEnergy`, so every one of these fixes shares
  one implementation rather than five separate ad-hoc parsers. Each site
  prefers real `card.types` data when present (correctly handles
  multi-type Special Energy on the rare case that data exists) and only
  falls back to name inference when `types` is empty.
- Confirmed NOT affected, checked explicitly rather than assumed: the
  Pokémon evolution-stage checks in `statistics.ts`/`validate.ts`'s
  `isBasicPokemon` (a different, correctly-documented `stage` field,
  confirmed against TCGdex's own reference docs), `repository.ts`'s
  deck-library energy-icon computation (explicitly Pokémon-scoped
  already), and `deck-card-grouping.ts`'s Trainer-subtype checks
  (different card category, no evidence of the same issue).
- Still open, unchanged from before: `EnergyTypeIcon`/`EnergyTypeStack`
  in `CardImageModal.tsx`, `DeckCardList.tsx`, and the deck print page
  still read `card.types` directly for icon display — logged as a
  follow-up in an earlier entry, not addressed in this pass since it's a
  cosmetic gap rather than a scoring/data-correctness one.

## Code audit: closed the open Energy-type-icon display gap, found and fixed a filter-injection issue

General code audit requested — not triggered by a specific bug report.
Read the actual shipped codebase (not just the brief docs, which turned
out to be stale relative to this file — the project's copy of
`DECISIONS.md` was ~500 lines behind the one in the repo, missing the
whole TCGdex migration and UI/UX redesign). Baseline before touching
anything: `tsc --noEmit`, `eslint`, and `vitest run` all clean (177/177
tests). Findings and fixes:

- **Fixed the open gap flagged in the entry directly above.**
  `CardImageModal`, `DeckCardList`, and the print page all read
  `card.types` directly with no fallback, so they silently showed no
  type icon for almost every real Energy card (TCGdex leaves `types`
  empty for most of them) — on screen and on printed decklists. Four
  other call sites (`review-cards.ts`, `statistics.ts`, `deck-quality.ts`,
  `candidate-pool-summary.ts`) already had their own ad-hoc copy of the
  same name-inference fallback. Consolidated all of it into one new
  exported helper, `resolveDisplayTypes` in `validate.ts`, and wired the
  three broken components to use it. Left the four already-fixed,
  already-tested call sites as-is rather than risk a behavior change for
  a DRY-ness-only win. Added a dedicated `resolveDisplayTypes` test suite
  (5 cases) rather than only relying on the indirect coverage the other
  four sites already had.
- **Found and fixed a real filter-injection gap in `searchLocalCards`.**
  The Energy-type broadened-match fix (`types.cs.{type},name.ilike.%type%`)
  interpolates `pokemonType` directly into a raw PostgREST `.or()`
  filter-syntax string. `pokemonType` is free-form at the API boundary —
  the Zod schema only caps its length; the UI's own dropdown is what
  normally constrains it, but a direct API caller isn't bound by that.
  A value containing PostgREST-meaningful characters (`,`, `(`, `)`,
  `{`, `}`, `"`) could break out of the intended filter or alter its
  logic. Blast radius was already bounded (this only ever touches the
  `cards` table, which is entirely public data with no per-owner
  scoping), but it's still the kind of raw-string-interpolation pattern
  that shouldn't exist regardless of current radius, and a future reuse
  of the same pattern against owner-scoped data would be a real problem.
  Fixed by adding `isSafeEnergyTypeWord` — real elemental type names are
  always a single plain word (Fire, Water, Colorless, ...), so the
  broadened-match branch now only fires when the input actually looks
  like one; anything else falls back to the plain, safely-parameterized
  `.contains()` filter already used for every other supertype, rather
  than being rejected outright. Exported the predicate specifically so
  it's directly unit-testable (3 new tests) without needing to exercise
  the Supabase-calling function around it — consistent with this
  codebase's existing boundary of not unit-testing real network I/O
  directly.
- **Hardened `updateOwnedDeck` for consistency, not because of a found
  exploit.** Its actual `UPDATE` statement filtered only on `id`,
  relying on a preceding ownership `SELECT` to have already confirmed
  the deck belongs to `ownerId`. Not exploitable in practice — deck
  ownership is set once at creation and never transferred, so there's no
  realistic race between the check and the write — but it was the one
  mutation in `repository.ts` that didn't double-scope its own write by
  `owner_id` directly, unlike every sibling function
  (`softDeleteOwnedDeck`, `restoreOwnedDeck`, `enableSharing`,
  `revokeSharing`). Added `.eq("owner_id", ownerId)` to the `UPDATE`
  itself to match the established pattern.
- Checked and did NOT change, with reasoning:
  - `with-error-handling.ts` returns the raw `error.message` to the
    client on any unhandled 500. This is a deliberate, already-documented
    tradeoff (see the Post-Phase-3 fix entry above) made specifically to
    fix bare, bodyless 500s that were hard to debug from the client
    console. Worth someone's explicit call on whether to keep it as-is
    for a personal project vs. return a generic message and rely solely
    on `reportError`'s server-side logging — not changed unilaterally
    here since it reverses a deliberate prior decision, not an oversight.
  - General request throttling on card search (`/api/cards`) — flagged
    as deferred to "Phase 8 hardening" back in Phase 7 and never actually
    picked up. Less urgent now than when flagged (search reads a local,
    indexed table instead of hitting a rate-limited third party), but
    the endpoint is still unauthenticated and publicly reachable. Left
    as a known open item rather than guessing at a rate-limiting
    mechanism the person hasn't chosen.
  - Re-audited every remaining `card.types` / `subtypes.includes("Basic")`
    site in the codebase (not just the three fixed here) to confirm
    nothing else was missed — the two remaining raw `subtypes.includes
    ("Basic")` checks are both correctly Pokémon-scoped (`isBasicPokemon`,
    `statistics.ts`'s evolution-stage tally), already confirmed unaffected
    in the entry above.
  - The AI Deck Assist redesign's manual composition override (brief
    section 5b) is still not built — confirmed via a repo-wide grep, not
    assumed. Unchanged status from when it was originally flagged as a
    deliberate follow-up, not forgotten.
- Verified: `tsc --noEmit` clean, `eslint` clean (0 warnings), 185 unit
  tests pass (177 previous + 8 new), and a full production build
  succeeds.

## Maintenance: manual sync-cards run to verify pipeline health

- Ran the `Sync card database` workflow manually via `workflow_dispatch`
  to confirm the weekly cron pipeline is still healthy, rather than
  waiting for the next scheduled Monday run.
- Result: 220/220 sets attempted, 23,735 cards synced. One set
  (`miscp` — Miscellaneous Promos) hit a transient `503` from TCGdex,
  retried 3 times with the existing backoff, then was skipped per the
  documented per-set resilience behaviour — the script correctly exited
  non-zero to flag it for a retry rather than silently swallowing the
  gap. This is the designed behaviour (see the "sync script hit the
  API's rate limit" entry above), not a regression.
- Confirms the retry/skip/idempotent-upsert design introduced for the
  original pokemontcg.io rate-limit issue continues to work correctly
  under the current TCGdex provider.

## Fix: AI deck generation could exclude the requested Pokémon, patched with a stricter approach

- User-supplied patch (`format-legality-and-generation-fix.patch`) revises
  the generation-candidate format-legality handling introduced in the
  earlier "requested Pokémon silently excluded from its own generated
  deck" fix (see above).
- **Reverses the earlier approach**: that fix removed the format-legality
  filter from candidate gathering entirely, letting illegal candidates
  through and relying on the model to prefer legal ones (flagged
  afterward via normal `FORMAT_ILLEGAL` validation). This patch instead:
  - Resolves the target Pokémon **only from printings actually legal in
    the requested format** (`legalTargetMatches[0]`, no fallback to an
    illegal printing).
  - Distinguishes "no card by this name exists at all" from "it exists,
    just not legal in this format" via a new `foundButIllegal` flag, and
    fails fast with a new `PokemonNotLegalInFormatError` (404,
    `POKEMON_NOT_LEGAL_IN_FORMAT`) in the latter case, rather than
    generating a deck around an illegal printing.
  - Hard-filters **every** candidate by `isCardLegalInFormat`, not just
    the target — a generated deck's cards are now always fully legal in
    the requested format, or generation fails before any AI call happens.
  - Removes the now-unnecessary "may include cards flagged as not legal"
    caveat previously prepended to the generation explanation banner.
  - `GENERATION_PROMPT_VERSION` bumped to `2.1.0`; the
    `legalInSelectedFormat` field is now always `true`, and the prompt
    instructions were updated to say so rather than asking the model to
    weigh legal vs. illegal candidates.
- **Also fixes an unrelated, separately-discovered schema-strictness bug**
  in the same area: `parseAndValidateGenerationOutput` previously rejected
  an entire generation response if *any* single card entry was malformed
  (e.g. the model zeroing out a card's count during a refinement pass to
  signal "remove this," rather than omitting the entry — not explicitly
  forbidden by the prompt at the time). Now validates the outer shape
  strictly (`deckName`/`explanation`/`cards` must be present and an
  array), but drops individual malformed card entries rather than failing
  the whole response — matching the leniency already used one layer
  downstream in `buildVerifiedGeneratedDeck`. Still returns `null`
  (genuine failure) if zero entries survive. The refinement prompt
  instructions were also updated to explicitly say "omit to remove, never
  count: 0."
- Verified before pushing: `tsc --noEmit` clean, `eslint` clean, all 187
  unit tests pass (185 previous + 2 new, covering the mixed-malformed-
  entries case and the all-entries-malformed case).

## Fix: AI deck generation could badly miss composition targets (e.g. 39 Energy vs. an 8-12 target) and sometimes came up short of 60 cards

- **Root cause, found by tracing the actual prompts sent to the model**:
  `archetype-profiles.ts`'s numeric thresholds (Pokémon/Trainer/Energy
  ranges, draw/search minimums) were used *only* by `deck-quality.ts` to
  grade a deck after the fact — neither the strategy-plan prompt nor the
  compile prompt ever told the model what those numbers actually were.
  The model only ever saw a bare archetype label (e.g. `"other"`, or
  `null`) and had to infer typical composition purely from general
  Pokémon TCG knowledge, with zero grounding in the exact ranges its
  output would be scored against. A deck with 39 Energy against an
  "other"-profile target of 8-12 is consistent with this: the model was
  never actually shown "8-12" as a number anywhere in the initial prompt.
- **Fix**: both `buildPlanDataBlock` and `buildGenerationDataBlock` now
  include an explicit `archetypeTargets` block (`pokemonRange`,
  `trainerRange`, `energyRange`, `drawSupportMin`, `searchSupportMin`,
  `basicPokemonMin` — sourced directly from `getArchetypeProfile`, the
  same function `deck-quality.ts` itself uses to grade the result).
  `PLAN_TASK_INSTRUCTIONS` and `GENERATION_TASK_INSTRUCTIONS` were
  rewritten to tell the model these are the *exact* thresholds it will
  be scored against, not generic guidance, and to require the plan's
  Pokémon/Trainer/Energy split to both sum to 60 AND fall within
  `archetypeTargets` simultaneously. `archetypeTargets` is included in
  the compile-stage data block even when a `plan` is also present, as a
  concrete cross-check rather than relying solely on the plan having
  gotten it right. `PLAN_PROMPT_VERSION` bumped to `1.1.0`,
  `GENERATION_PROMPT_VERSION` to `2.2.0`.
- **Second, related gap**: nothing previously checked whether a
  generated deck actually reached 60 total cards — `deck-quality.ts` only
  checked each category's (Pokémon/Trainer/Energy) *proportion*, never
  the sum. A deck that came back well short of 60 could pass every hard
  check undetected, meaning the one bounded refinement pass was never
  even triggered to try to fix it. Added `TOTAL_CARD_COUNT_LOW` as a new
  hard check (`total >= 60`) in `computeDeckQuality`, so an incomplete
  deck now reliably triggers the same refinement-and-flag path every
  other composition problem does — consistent with the existing "flag,
  attempt one refinement, never fabricate filler" discipline, not a
  change to that discipline itself.
- **Third, related gap — refinement-pass instruction ambiguity**: the
  previous refinement wording ("adjust `previousCards`... changing as
  few cards as possible... omit a card to remove it") never explicitly
  said unchanged cards must still be re-included in the output. Read
  uncharitably, a model could interpret this as "only output what
  changed," which — since `buildVerifiedGeneratedDeck` treats `cards` as
  the complete final decklist, not a diff — would silently drop most of
  a previously-good 60-card deck down to just a handful of entries. This
  is a highly plausible mechanism for "doesn't always fill 60 cards,"
  especially combined with the first gap above (a refinement pass is
  exactly when the model is reacting to feedback and most likely to
  reshape its output). Reworded the refinement rule to state explicitly:
  every card not being changed must still appear in the output with its
  original count; omission means removal, and only removal.
- `makeGoodDeck()` in `deck-quality.test.ts` updated to actually total 60
  (previously totaled 47, which passed every check only because nothing
  checked the total) so the "passes all hard checks" baseline test stays
  meaningful now that `TOTAL_CARD_COUNT_LOW` exists. New tests added:
  one confirming `TOTAL_CARD_COUNT_LOW` fires correctly when every other
  check individually passes but the total is short, and two covering
  `archetypeTargets` actually appearing correctly in both prompt data
  blocks (`generation-archetype-targets.test.ts`).
- Verified: `tsc --noEmit` clean, `eslint` clean, 191 unit tests pass
  (187 previous + 4 new).

## Addition: qualitative battle-style guidance + strategic tie-breaking order, per user-supplied deck-building rules doc

- User shared a house "Pokémon TCG Deck-Building Rules" reference doc.
  Cross-checked it against the app first rather than applying it
  wholesale:
  - Its general Pokémon/Trainer/Energy ranges (15-20 / 20-30 / 8-12)
    already exactly match the existing `"other"` archetype profile — no
    change needed there.
  - Format is already a required field both in `generateDeckSchema` and
    the generator form's UI (defaults to "standard", always sent) — the
    doc's "ask the user for a format" requirement is already satisfied
    structurally, no conversational ask step added.
  - The doc's copy-limit section said **3** copies max; confirmed with
    the user this should stay **4** (the real Pokémon TCG rule, and what
    `DEFAULT_COPY_LIMIT` in both `validate.ts` and `verify-generation.ts`
    already enforces) — treated as a typo in the doc, not implemented.
  - Kept `"other"` as the fourth archetype (the doc only describes three
    battle styles) per explicit confirmation — `"other"` continues to use
    the generic default profile, no forced choice among the three.
- **What was genuinely new and got added**: the model was previously only
  ever shown a bare archetype label (`"aggro"`, `"mill"`, etc., or
  `null`) with no explanation of what that style actually means for card
  selection — same gap as the earlier "39 Energy" fix, just on the
  qualitative side instead of the numeric side. Added
  `strategyDescription` to each `ArchetypeProfile` in
  `archetype-profiles.ts` (paraphrased from the doc's per-style priority
  lists), surfaced via the same `archetypeTargets` block already used for
  the numeric ranges (both `plan-prompt.ts` and `generation-prompt.ts`).
- Added an explicit strategic tie-breaking order to
  `GENERATION_TASK_INSTRUCTIONS` for when two candidates compete for the
  same slot: support-for-primary-Pokémon > consistency > battle-style
  alignment > resource efficiency > flexibility/utility > raw power.
  Deliberately dropped the doc's top two priorities (format legality,
  copy-limit compliance) from this list — both are already guaranteed
  *structurally* by `gatherDeckGenerationCandidates`'s legality filter and
  `buildVerifiedGeneratedDeck`'s copy-limit enforcement, so they aren't
  really tie-breakers the model needs to reason about; the prompt now
  says this explicitly so the model doesn't waste effort double-guessing
  something already deterministically enforced.
- Added explicit "a supporting Pokémon can be essential to the deck's
  engine without becoming a second primary focus" guidance to the compile
  prompt, and both prompts now frame `pokemonName` as the deck's single
  primary focus that every other card's inclusion should be justifiable
  against.
- Enriched the `"explanation"` output requirement to explicitly ask for
  the primary Pokémon's role and the purpose of the most important
  supporting cards/combinations, not just a general strategy summary —
  matches the doc's final-presentation section.
- `PLAN_PROMPT_VERSION` bumped to `1.2.0`, `GENERATION_PROMPT_VERSION` to
  `2.3.0`.
- Tests updated/added in `generation-archetype-targets.test.ts`:
  `strategyDescription` now part of the expected `archetypeTargets`
  shape; new tests confirm the "other" fallback description text and
  that all four archetypes get distinct descriptions.
- Verified: `tsc --noEmit` clean, `eslint` clean, 192 unit tests pass
  (191 previous + 1 new).

## Fix: real generation report — no supporting Pokémon, 36 Energy, only 8 Trainer cards

- User reported real generated decks with three problems at once: no
  Pokémon beyond the primary evolution line, 36 Energy against an 8-12
  target, and only 8 Trainer cards. Traced each to a distinct root cause
  rather than treating it as one vague "the prompt doesn't work" issue —
  the previous grounding fix (archetypeTargets, strategyDescription) was
  necessary but not sufficient, since none of it addresses what the
  candidate pool actually contains or guarantees compliance deterministically.
- **Root cause 1 — candidate pool crowded out by redundant printings.**
  `gatherDeckGenerationCandidates` added the target Pokémon's printings
  with `targetMatches.forEach(addIfNew)` — unlike every other step in the
  same function (all sliced to 2-3/10/1), this one added *every* legal
  printing found, up to the 100 fetched. A Pokémon with many reprints
  could consume a large share of the 80-candidate budget before "other
  Pokémon sharing a type" ever ran. Fixed: `targetMatches.slice(0, 5)`.
- **Root cause 2 — Trainer candidates capped at 9 hardcoded staple
  names.** Draw/search/utility staple lists totaled 9 real cards, each
  max 4 copies (36 total ceiling) with very little variety — genuinely
  hard to reach a 20-42 Trainer target with real choice from that few
  options. Widened to 4 draw (`+ Judge, Cynthia`), 5 search (`+ Level
  Ball, Great Ball`), 6 utility (`+ Escape Rope, Super Rod`) — 15 staples
  total, 60-copy ceiling. Shared by both `gatherCandidateCards` (AI
  review) and `gatherDeckGenerationCandidates` (generation), since both
  read from the same constants — review's swap-suggestion variety
  benefits too, not just generation.
- **Root cause 3 — nothing deterministically capped Energy.** The prompt
  asks the model to stay within `archetypeTargets.energyRange`, and the
  one bounded refinement pass nudges it if it doesn't — but neither is a
  guarantee, and Basic Energy is exempt from the per-name copy limit, so
  a single Energy candidate could be assigned an arbitrarily large count
  (36, in the reported case) and pass straight through construction
  untouched. This is exactly the kind of thing this app's own stated
  discipline says shouldn't be left to the model — "verification is
  enforcement by construction, not filtering after the fact" (see the
  redesign brief's `buildVerifiedGeneratedDeck` note). Added a
  `maxEnergyCount` option to `buildVerifiedGeneratedDeck`: once the
  running Energy total reaches it, further Energy is truncated the same
  way the 60-card cap already truncates overshoot. `generation-service.ts`
  now passes `getArchetypeProfile(strategyArchetype).energyRange[1]` in on
  every `verify()` call (both the initial and refinement compile passes).
  Deliberately only a ceiling, not a floor — a deck genuinely short on
  Energy still gets flagged by the existing hard checks rather than this
  function inventing copies the model didn't choose, consistent with the
  "never pad" rule already documented for this function.
- **Prompt fix — plan's named secondary lines were never actually
  referenced in the compile step.** `GENERATION_TASK_INSTRUCTIONS` told
  the model to follow the plan's numeric Pokémon/Trainer/Energy counts,
  but never told it to actually use the plan's `attackerLine`/
  `secondaryLines` (the specific Pokémon names the plan intended beyond
  the primary evolution line) when compiling the actual card list —
  plausible mechanism for "only the evolution line, no other Pokémon"
  independent of root cause 1. Added an explicit instruction: for every
  name in `attackerLine`/`secondaryLines` that also appears among
  `candidateCards`, include real printings of it; don't build a deck
  containing only the primary line while ignoring the plan's named
  secondary lines. `GENERATION_PROMPT_VERSION` bumped to `2.4.0`.
- New tests in `verify-generation.test.ts` (`maxEnergyCount option`
  describe block): caps a single Energy candidate's count; caps the SUM
  across multiple Energy candidates, not each independently; confirms no
  cap applies when the option is omitted (existing behaviour preserved);
  confirms the cap never touches non-Energy cards.
- Verified: `tsc --noEmit` clean, `eslint` clean, 196 unit tests pass
  (192 previous + 4 new).

## Fix: candidate pool had no path to off-type "engine" Pokémon (found by hand-simulating the actual prompt)

- Prompted by the user asking why a hand-simulated run of the exact
  current prompt (done directly in conversation, playing the "compile"
  model's role) produced a good deck, while the live app still didn't.
  Tracing through what I'd actually used in that simulation surfaced the
  real gap: I'd included Bibarel as a draw-engine support Pokémon using
  general TCG knowledge — but `GENERATION_TASK_INSTRUCTIONS` forbids the
  real model from proposing anything outside `candidateCards`, and
  Bibarel (Colorless/Normal) would never have been *in* that pool for a
  Water/Psychic target like Slowbro, because the only Pokémon-candidate
  sources were: the target's own printings, its evolution line, and
  "other Pokémon sharing the target's type." A real model, faithfully
  following the same instructions, could never have proposed it. My
  simulation wasn't proof the live pipeline would work — it was a false
  positive caused by having knowledge the real model's candidate pool
  didn't actually contain.
- This is the same category of gap as the Trainer-staples fix a few
  commits back (9 hardcoded names, too few to reach a 20-42 target with
  real variety) — except it had never been addressed for Pokémon at all.
  Real "engine" Pokémon (picked for an ability like a draw or search
  effect, not for matching the primary attacker's type) are commonly
  off-type by design, so a type-scoped search structurally can't surface
  them, no matter how good the prompt wording is.
- Fixed by adding `STAPLE_UTILITY_POKEMON_NAMES` (currently
  `Bidoof/Bibarel`, `Manaphy`) — searched by exact name regardless of
  type, same pattern as the Trainer staple lists, in both
  `gatherDeckGenerationCandidates` (generation) and `gatherCandidateCards`
  (AI review, same blind spot, same fix). Each entry pairs a name with
  its `evolvesFrom` (or `null`) so a two-stage engine's Basic half is
  gathered too, rather than relying on `ensureEvolutionPrerequisites` to
  backfill it later.
- No prompt-text change needed for this one — the model already knows to
  freely choose from whatever's in `candidateCards` for secondary lines;
  the fix is purely about the candidate pool actually containing
  reasonable off-type options in the first place.
- Deliberately a short, conservative starting list rather than an
  exhaustive one, same judgment-call caveat as the Trainer lists — worth
  revisiting if particular engine Pokémon consistently feel missing.
- No new unit test: `candidate-cards.ts` is `server-only` and does real
  DB lookups (`searchLocalCards`), same testing-boundary precedent as the
  rest of this file and `pokemonTcgApiProvider`'s own network calls —
  only the pure functions around it are directly unit-tested.
- Verified: `tsc --noEmit` clean, `eslint` clean, 196 unit tests
  unchanged and passing (no new tests, no existing ones affected).

## Fix: apostrophe-mismatch in exact-name candidate search + diagnostic logging to separate "code bug" from "thin database"

- User's next AI-generation explanation reported an explicitly thin
  candidate pool ("only 9 Pokémon (5 Psychic-typed)... no dedicated draw
  or search support cards... just 3 generic Trainer candidates") — a
  different, more fundamental symptom than the earlier "prompt not
  followed" reports, since this is the model accurately describing what
  it was actually given, not misusing what it had.
- **Confirmed real bug**: `findExactNameMatches`'s underlying
  `searchLocalCards` call uses a literal Postgres `ILIKE` substring
  match. TCGdex's own data uses a curly apostrophe (`Professor’s
  Research`, U+2019); our hardcoded staple lists use a plain ASCII one
  (`'`, U+0027). A byte-mismatch there means the ILIKE query returns
  **zero rows**, not a near-miss — the exact-match filter downstream
  never even gets anything to filter. Fixed two ways: `toIlikeSearchTerm`
  replaces a straight apostrophe with Postgres's `_` wildcard (matches
  any single character) before the query is sent, so it matches either
  quote style; `normalizeQuotes` then does the same normalization for the
  exact-match comparison afterward, so the widened query can't
  accidentally let through some unrelated card. Both exported and
  directly unit-tested (`candidate-cards-name-matching.test.ts`), same
  pattern as `isSafeEnergyTypeWord` in `local-card-repository.ts`.
- **Named but not fixed here, and flagged explicitly**: this apostrophe
  issue can only explain 2 of the 15 Trainer staple names ("Professor's
  Research", "Boss's Orders") — it doesn't account for "only 3 of 15
  matched" on its own. The much likelier dominant explanation is that the
  Supabase project this particular environment reads from doesn't
  actually have the full ~23,735-card sync in it — e.g. a mismatch
  between `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` as
  configured in Vercel vs. what the GitHub Actions sync workflow's
  secrets point at, a risk the local-card-database brief explicitly
  named ahead of time ("same values as Vercel's, entered separately").
  This can't be confirmed or fixed from here — I don't have credentials
  or network access to the live Supabase project from this sandbox, and
  Supabase isn't on the allowed egress list regardless. Needs the row
  count in the `cards` table checked directly against the two
  environments' Supabase URLs.
- **Added diagnostic logging either way**, since "the pool is thin
  because of a code bug" and "the pool is thin because the database
  genuinely has little data" look identical from the outside (a short
  candidate list) but need completely different fixes.
  `gatherDeckGenerationCandidates` now returns a `diagnostics` object
  (`bySupertype` counts, `staplesMissed` — staple names that resolved
  zero matches at all, `totalStaplesSearched`), logged by
  `generation-service.ts` alongside the existing candidate-pool-gathered
  log line. The next generation attempt's Vercel function logs will show
  directly whether specific staples are being missed (name-matching bug)
  or whether counts are thin everywhere including well-known non-
  apostrophe names like "Ultra Ball" (points at the database itself).
- Verified: `tsc --noEmit` clean, `eslint` clean, 203 unit tests pass
  (196 previous + 7 new).

## Fix: found the actual root cause — slice-before-legality-check in every candidate-gathering step

- Live diagnostic data from the user's Vercel logs finally made this
  conclusive rather than another guess: `staplesMissed: []` — **every
  single one of the 18 staple searches found a real card by name** — but
  `candidatesBySupertype` showed only `{ Pokémon: 5, Trainer: 3, Energy:
  1 }`, i.e. only 3 of 15 Trainer staples and a fraction of the Pokémon
  staples actually survived into the pool. "Found by name but didn't
  survive" can only mean the legality filter, not a name-matching or
  database-population problem — which ruled out both of the last two
  rounds of guessing (Supabase env var, database row count) as the
  actual cause, even though they were reasonable things to check.
- **Root cause**: every candidate-gathering step in both
  `gatherDeckGenerationCandidates` and `gatherCandidateCards` sliced its
  search results down to a small number (`.slice(0, 1)`, `.slice(0, 2)`,
  `.slice(0, 3)`, `.slice(0, 10)`) *before* `addIfNew` ever checked
  format legality. `searchLocalCards` orders results newest-first, so if
  the single most-recent printing of e.g. "Professor's Research" happens
  to be a promo or special print without Standard legality flagged, the
  entire slice comes back illegal and gets silently dropped by
  `addIfNew` — even though an older, legal reprint of the exact same
  card exists a few positions further down the very same result list
  that was already fetched. This is the *identical shape* of bug already
  fixed once, specifically for target-Pokémon resolution (see the
  "requested Pokémon silently excluded from its own generated deck" fix
  much earlier in this file) — it was just never applied to any of the
  other gathering steps that came after it.
- Fixed by adding `takeLegal(cards, format, n)` — filters to legal-in-
  format cards *before* taking the top `n`, rather than after — and
  applying it to every gathering step in both functions: evolution-line
  completions, same-type Pokémon, off-type engine Pokémon staples,
  Trainer staples, and type-matched Basic Energy. The target's own
  printings step now uses the already-legal-filtered
  `legalTargetMatches` (computed a few lines earlier for target
  resolution) instead of the raw, unfiltered `targetMatches`, for the
  same reason.
- This also retroactively explains why the earlier fixes (widened
  Trainer staple list, off-type engine Pokémon, apostrophe normalization)
  didn't actually resolve the user's report even though they were all
  genuine, correctly-implemented improvements: none of them addressed
  the fact that whatever *did* get found was still being thrown away by
  this ordering bug before it could ever reach the candidate pool.
- New tests in `candidate-cards-name-matching.test.ts`: `takeLegal`
  correctly skips an illegal card even when it sorts first and finds a
  legal one further down the same list (the exact reported scenario);
  returns empty when nothing is legal; respects the requested cap;
  treats everything as legal when format is `"all"`.
- Verified: `tsc --noEmit` clean, `eslint` clean, 207 unit tests pass
  (203 previous + 4 new).

## Fix: root cause was a new game era, not a bug — added role-based (name-agnostic) Trainer discovery

- Directly queried the live database via Supabase's SQL editor for every
  "Professor's Research" printing: every single row showed
  `legality_standard: "not_legal"`, including one from a set released as
  recently as July 2025 — while `legality_expanded` was correctly
  populated as `"legal"` for the same rows. That ruled out both of the
  last two hypotheses (env var misconfiguration, a mapping/sync bug):
  the data itself is internally consistent (expanded legality varies
  correctly; only standard is uniformly excluded), which is what real
  rotation looks like, not corrupted data.
- Cross-referenced against the earlier sync log, which listed sets named
  `A3`, `A3a`, `A4`, `B1`, `B1a`, `B2`, `me01`-`me05`, `30th` — a
  completely different naming scheme from the `sv`-prefixed sets every
  failing staple's printings came from. **Conclusion: the game has moved
  into a new block/era since the sv-prefixed sets released, and current
  Standard rotation has moved past all of them.** Professor's Research,
  Iono, Cynthia, and most of the Ball-family search cards are correctly,
  currently not Standard-legal — this is real data, not a bug. (Some
  staple names — Judge, Ultra Ball, Switch, Rare Candy, Boss's Orders —
  did still resolve, presumably via a reprint that also exists in the
  newer era's sets.)
- This reframes the whole multi-round investigation: the ordering bug
  fixed a few commits ago was real and worth fixing, but the dominant
  remaining cause was that `STAPLE_DRAW_TRAINER_NAMES` /
  `STAPLE_SEARCH_TRAINER_NAMES` were curated from general Pokémon TCG
  knowledge that has no visibility into whatever the new era's actual
  staple cards are named — knowledge that can't be "fixed" by picking a
  different hardcoded list, since the same problem will just recur at
  the next rotation.
- **Fix: search by role instead of by name.** Added
  `findRoleBasedTrainerCandidates` — queries the 100 most-recent Trainer
  cards (no name filter), filters to legal-in-format via the same
  `takeLegal`, then classifies each with the existing
  `isDrawSupportCard`/`isSearchSupportCard` text-heuristic functions
  (`text-heuristics.ts`, already used elsewhere in this app for deck
  statistics) rather than matching against a fixed name list. This
  self-adapts to any future rotation automatically — it finds whatever
  the *current* era's actual draw/search staples are by what their text
  does, not by whether their name happens to match something curated
  months or years ago. Added to both `gatherDeckGenerationCandidates`
  and `gatherCandidateCards`, alongside (not replacing) the existing
  name-based staple lists — those still contribute real value for
  evergreen reprints, no reason to discard that.
- Added `roleBasedTrainersFound` to the diagnostics/log output so the
  next attempt shows directly how many real draw/search candidates this
  new path is actually finding.
- Deliberately did not attempt an equivalent role-based search for
  "engine" Pokémon (`STAPLE_UTILITY_POKEMON_NAMES` — Bibarel, Manaphy):
  there's no existing text-heuristic for "ability-based support Pokémon"
  the way there is for draw/search Trainers, and inventing one carries a
  real risk of false positives across the huge variety of real Pokémon
  abilities. Left as a known, smaller remaining gap rather than guessed
  at without the same evidence-based confidence as the Trainer fix.
- No new unit tests: `findRoleBasedTrainerCandidates` is a thin
  composition of already-tested pieces (`takeLegal`, the existing
  `isDrawSupportCard`/`isSearchSupportCard` heuristics, both already
  covered elsewhere) around a live `searchLocalCards` call — same
  testing-boundary precedent as the rest of this file.
- Verified: `tsc --noEmit` clean, `eslint` clean, 207 unit tests
  unchanged and passing.

## Fix: the actual root cause, confirmed against TCGdex's own docs — Trainer/Energy rules text was never mapped

- Diagnostic SQL directly against the live database (`details->'rules'`
  for the most recent Standard-legal Trainer cards) showed empty arrays
  across the board — the previous entry's "new game era" explanation
  covered why old staple *names* had rotated out, but didn't explain why
  the *role-based* search (which doesn't care about names at all) also
  found zero draw/search matches. This is why: the underlying data these
  heuristics classify against was empty for every Trainer/Energy card,
  not just the ones whose names happened to be stale.
- Fetched TCGdex's own published Card reference
  (tcgdex.dev/reference/card) rather than continue guessing, and
  confirmed a real, clean mapping bug: **`description` is Pokémon-only
  flavor text** ("It makes a nest to suit its long and skinny body...")
  — Trainer cards don't even have this field per the schema. **The
  actual rules/effect text for Trainer and Energy cards is a separate,
  required field called `effect`.** `normalizeCard` in
  `tcgdex-api-core.ts` mapped `rules: raw.description ? [raw.description]
  : []` and never read `raw.effect` at all (the `RawCard` type didn't
  even declare it). Since Trainer/Energy cards have no `description`,
  this meant every Trainer/Energy card's actual rules text was silently
  dropped on every sync since the TCGdex migration — not a TCGdex data
  gap, not a new-era rotation issue, a genuine mapping bug on our side
  from day one of that migration.
- **Impact is much wider than AI deck generation** — anything reading
  `card.rules` was affected: `isDrawSupportCard`/`isSearchSupportCard`
  (deck statistics' draw/search-support counts, shown on every deck's
  stats dashboard, not just AI-generated ones), AI review's candidate
  gathering and swap suggestions, and the card detail page's displayed
  rules text for every Trainer/Energy card. This had been silently wrong
  for every deck in the app since the TCGdex migration, not something
  specific to this debugging session.
- Fixed: added `effect?: string` to the `RawCard` type (documented
  against the real schema, with the bug explained inline so it can't
  silently regress), changed the mapping to `rules: raw.effect ?
  [raw.effect] : []`. Deliberately does NOT fall back to `description`
  for anything — flavor text isn't rules text, and folding it in would
  let the draw/search heuristics false-match on Pokédex flavor prose.
- Added test coverage that didn't exist before this (a real gap — this
  mapping had zero direct tests, which is exactly how it shipped and
  went unnoticed): a Trainer card's `effect` maps to `rules` correctly;
  same for Energy; `description` is never used as a fallback for a
  Trainer card even if present; a Pokémon card with no `effect` gets an
  empty `rules` array rather than incorrectly picking up flavor text.
- **This is a data-mapping fix, not just a code fix** — the 24,548 rows
  already in the database were synced under the old, broken mapping, so
  fixing `normalizeCard` alone doesn't retroactively correct what's
  already stored. A fresh full sync (upserts every card, which is how
  this sync has always worked — see the local-card-database brief) is
  required to actually populate the corrected `rules` text into the live
  database. Triggered immediately after this push, not left for the next
  scheduled weekly run.
- Verified: `tsc --noEmit` clean, `eslint` clean, 211 unit tests pass
  (207 previous + 4 new).

## Fix: widened Pokémon/Energy search windows, added issue-level diagnostic logging, strengthened refinement's Energy guidance

- Follow-up to the rules-text fix: Trainer diversity improved
  dramatically (5→13 candidates, 8 real role-based matches) as expected,
  but Pokémon stayed flat at 7 and Energy at 1 candidate, and the actual
  generated deck still only included 4 Energy despite the 1 available
  candidate having no copy limit.
- **Widened every remaining narrow search window**, same shape of fix
  already proven for Trainer staples (10→25): evolution-line name
  searches (default pageSize 10 → 25 in both gathering functions),
  same-type Pokémon search (pageSize 20→60, take-count 10→15 in
  generation; 10→40/3→5 in review), and matching-type Energy search
  (pageSize 5→15, take-count 1→2 in both). All follow the same
  reasoning: a small page ordered newest-first, with no legality
  pre-filter, can be dominated by illegal prints before reaching a
  currently-legal one — exactly what was already proven for Trainers.
- **Added issue-level diagnostic logging.** The quality-check log lines
  previously only reported a hard-issue *count*, which made it
  impossible to tell whether a refinement pass fixed the thing it was
  given feedback about or traded one problem for a different one (a real
  observed case: post-refinement hard-issue count went UP, from 4 to 5,
  with no way to see why). Now logs the actual `{code, message}` for
  every hard issue, plus the deck's Pokémon/Trainer/Energy/draw/search
  totals, on both the initial and post-refinement checks.
- **Strengthened the refinement prompt's Energy guidance specifically**:
  when feedback says Energy is below the target range and an Energy
  candidate already exists, the minimal correct fix is almost always to
  *increase that existing entry's count* (Basic Energy has no copy
  limit) rather than leave it low or add an unrelated card — made this
  explicit rather than leaving the model to infer it from the general
  "change as few cards as possible" rule, since the pool clearly had
  headroom (1 candidate, uncapped quantity) that wasn't being used.
  `GENERATION_PROMPT_VERSION` bumped to `2.5.0`.
- Verified: `tsc --noEmit` clean, `eslint` clean, 211 unit tests
  unchanged and passing (no new tests — these are search-window/logging/
  prompt-wording changes to already-covered functions, not new logic
  branches).

## Fix: compile call truncated mid-JSON — max_tokens too low once candidate pool actually got rich

- Real production failure, right after the candidate-pool widening
  landed: `AI deck generation: compilation failed` /
  `AiReviewOutputError` — schema validation failed on the Anthropic
  tool_use input, with the logged `rawJsonPreview` cutting off mid-word
  ("...so Slowbro's 'empty hand' b`). That's the signature of hitting
  `max_tokens` before the model finished writing valid JSON, not a
  malformed-output problem.
- **A direct consequence of the last few fixes actually working**: the
  candidate pool went from 13-21 to 34 candidates (19 Pokémon, 13
  Trainer), meaning the model had real reason to choose a longer, more
  diverse decklist; combined with `GENERATION_TASK_INSTRUCTIONS`'s
  recently-enriched explanation requirement (must now cover the primary
  Pokémon's role AND the purpose of key supporting cards, not just a
  brief summary), a full response's token count grew past the existing
  `max_tokens: 8192` ceiling. Exact same failure shape already
  documented once for the AI review feature ("Post-Phase-7 fix: model
  returning strengths as a string" — also a `max_tokens` fix, 4096→8192
  at the time).
- Fixed by doubling `max_tokens` for the Anthropic `generateDeck` call:
  8192 → 16384, giving real headroom for a ~20-30-distinct-card decklist
  plus a thorough explanation rather than just enough for this one
  observed case.
- **Deliberately left the OpenAI adapter's `generateDeck` untouched** —
  it doesn't set `max_tokens` at all currently (relies on the SDK/API
  default), which is a pre-existing gap unrelated to this specific bug.
  Not fixed here to avoid scope creep on a path that isn't actually
  live (only `ANTHROPIC_API_KEY` is configured in this deployment, per
  earlier Phase 7 notes) — flagging it explicitly rather than leaving it
  silently unaddressed, worth a pass if/when an OpenAI key is ever added.
- No new test: this is a single numeric constant change to a live API
  call's parameters, not new branching logic — nothing new to unit-test
  that the existing schema-validation tests don't already cover.
- Verified: `tsc --noEmit` clean, `eslint` clean, 211 unit tests
  unchanged and passing.

## Fix: refinement addressed one listed feedback item and dropped another entirely

- Real production log showed the exact failure mode: initial check had 3
  hard issues (Pokémon count over range, total count 1 short, draw
  support at 4 vs. a 6 minimum). Post-refinement: Pokémon count issue
  fixed (21→18), but `draw: 4` was **completely unchanged** — the exact
  same number, meaning the model didn't act on that feedback item at
  all — and total count got *worse* (59→56), because the 3 Pokémon
  removed to fix the range issue were never replaced with anything,
  including the real draw-support candidates that were sitting right
  there in the candidate pool waiting to be used for exactly this.
- The refinement instructions already said to address "the listed
  feedback gaps" (plural), but evidently that wasn't specific enough to
  stop the model from treating multiple simultaneous issues as a single
  problem to partially solve. Strengthened the wording explicitly:
  address every item in the feedback list in one pass, not just the
  first or easiest one; and when fixing one gap requires removing cards,
  redirect the freed space toward another listed gap first (a concrete
  example given: replacing a trimmed excess-Pokémon slot with a real
  draw-support candidate, rather than just leaving the slot empty and
  the deck short). `GENERATION_PROMPT_VERSION` bumped to `2.6.0`.
- Separately investigating the user's report that a recently-released
  set ("30th Celebration") may be missing or mis-flagged as not
  Standard-legal — a concrete, checkable claim rather than a vague
  "not enough Pokémon" impression, so verifying directly via the
  database before assuming anything.

## Investigation: "30th Celebration" set not Standard-legal — checked against the real 2026 rotation rules, likely correct data

- User asked why the "30th Celebration"/"30th Classic Collection" sets
  (released 2026-09-16, very recently) show `not_legal` for Standard
  across every card checked, given they believed a newly-released set
  should be in format.
- Checked the official 2026 Standard rotation announcement
  (pokemon.com) rather than assume either way. The actual rule: **a
  card's legality is determined by its own printed regulation mark
  ("G" rotated out; "H"/"I"/"J" legal), not by how recently its set
  released.** The announcement's own example makes the point directly —
  an old-mark reprint of Boss's Orders stays illegal even though a
  different, current-mark reprint of the same card is legal; set
  recency doesn't override a card's own mark.
- Anniversary/celebration-themed sets like these are specifically built
  to reprint classic card *designs*, which commonly carry an old (or no)
  regulation mark rather than a current one. A September 2026 release
  date doesn't make a reprinted classic-era card Standard-legal if the
  print itself carries an old mark. Given that, `not_legal` for these
  two sets is very plausibly **accurate data, not a bug** — this is
  exactly the "recency ≠ legality" misconception the official rules
  explicitly call out.
- **Made this independently checkable rather than just argued**: added
  `Card.regulationMark` (optional, `string | null`) — TCGdex's schema
  already exposes a `regulationMark` field per card
  (`tcgdex.dev/reference/card`) that wasn't being captured anywhere.
  Mapped through `normalizeCard` (tcgdex-api-core.ts), persisted via
  `CardDetailsJson` in `card-row-mapping.ts` (the same catch-all JSON
  column pattern already used for every other non-searched field), and
  read back on `rowToCard`. Deliberately does NOT compute legality from
  this field anywhere — TCGdex's own `legal.standard`/`legal.expanded`
  booleans remain the actual source of truth used everywhere else in the
  app; this is purely so a future legality question like this one can be
  checked directly against the real regulation mark instead of inferred
  from an external article. Kept optional (not a required field) so
  every existing test fixture and older already-synced row stays valid
  without needing a fixture update everywhere a `Card` is constructed.
- Deliberately left out of `toDeckReviewCard`'s AI-facing allowlist
  (`review-cards.ts`) — same discipline already used to keep `price` out
  of the AI payload; this is a debugging aid for us, not something the
  model needs.
- New tests: `tcgdex-api-adapter.test.ts` covers `normalizeCard` mapping
  a real mark through and defaulting to `null` when absent;
  `card-row-mapping.test.ts` covers a real mark round-tripping through
  `cardToRow`/`rowToCard`, and falling back to `null` for an older card
  with no mark captured at all (also fixed the pre-existing "preserves
  every field" round-trip test's fixture, which needed an explicit
  `regulationMark: null` to stay meaningful once the row-mapping always
  writes a concrete `null` rather than leaving the column absent).
- Verified: `tsc --noEmit` clean, `eslint` clean, 214 unit tests pass
  (211 previous + 3 new).

## Fix: draw/search text heuristics only matched imperative phrasing, silently missing third-person Pokémon abilities

- Real production log showed the refinement pass producing a
  **completely unchanged** deck — every single total (Pokémon, Trainer,
  Energy, draw, search) identical before and after refinement, despite
  the strengthened "address every listed gap" instructions from the
  previous fix being live for this attempt. That's a stronger signal
  than "the model didn't fully comply" — it suggests the model may have
  had no better option to reach for, i.e. genuine candidate scarcity for
  the draw-support role specifically, not non-compliance.
- Checked `text-heuristics.ts` directly rather than guess again: `\bdraw\b`
  only matches the bare word "draw," never "draws" or "drawing." Same
  gap for `\bsearch\b` vs. "searches." Trainer card text is almost
  always imperative ("Draw 2 cards," "Search your deck for..."), but
  Pokémon abilities and attacks are very often phrased in third person
  ("This Pokémon draws 2 cards," "...searches your deck for a Basic
  Energy") — every one of those was silently invisible to
  `isDrawSupportCard`/`isSearchSupportCard`, understating the real count
  everywhere they're used: AI candidate classification (both the
  role-based Trainer search and the deck-quality draw/search hard
  checks), AND a deck's own stats-dashboard draw/search-support display
  for every deck in the app, not just AI-generated ones. This module had
  zero direct unit tests before this fix — the same "shipped with no
  coverage, went unnoticed" pattern as the earlier TCGdex rules-text bug.
- Fixed: widened all patterns to accept "s"/"es"/"ing" suffixes
  (`draws?`, `search(es)?`, `look(s|ing)?`, `reveal(s|ing)?`).
  `TEXT_HEURISTICS_VERSION` bumped to `1.1.0` per the module's own
  documented convention (invalidates anything that cached a count
  computed under the old, narrower patterns).
- Added a full test file that didn't exist before
  (`text-heuristics.test.ts`): imperative phrasing, third-person
  phrasing (the specific regression case), gerund phrasing, singular
  "draw a card," and a negative case for each function.
- Also widened diagnostic visibility for next time: `gatherDeckGeneration
  Candidates` now returns `roleBasedDrawNames`/`roleBasedSearchNames`
  (the actual card names found by role, not just a count), logged
  alongside the existing `roleBasedTrainersFound`. A "stuck at exactly N"
  report can now be traced directly to real candidate scarcity vs. model
  non-compliance without another round of hypothesis-and-guess.
- Verified: `tsc --noEmit` clean, `eslint` clean, 224 unit tests pass
  (214 previous + 10 new).

## Fix: confirmed by direct query — the same-type Pokémon cap was starving the model of real diversity

- User questioned whether "17 Psychic candidates" was a realistic sample
  or an artificial narrowing. Checked directly rather than reassure
  without evidence:
  ```sql
  select count(*) from cards
  where supertype = 'Pokémon' and legality_standard = 'legal'
    and 'Psychic' = any(types) and jsonb_array_length(details->'attacks') > 0;
  ```
  Result: **466** legal Psychic attackers actually exist. The generation
  pipeline's own `takeLegal(..., 15)` cap on the same-type search was
  throwing away the overwhelming majority of real, legal options before
  the model ever saw them — a genuine, confirmed artificial constraint,
  not a reasonable curation of a naturally small pool.
- Raised both the fetch window and the take-count for the same-type
  search: generation path pageSize 60→150, take-count 15→30 (well within
  the 80-candidate total budget; `addIfNew`'s own per-step size check
  still gracefully caps the running total, so this can't overflow even
  for a dual-type Pokémon running the loop twice). Applied the same
  fix proportionally to the review path (pageSize 40→100, take 5→10,
  scaled down to fit its smaller 30-candidate total budget).
- Deliberately did NOT raise `GENERATION_MAX_CANDIDATES` (80) itself —
  that's a deliberate design budget from the approved redesign brief for
  prompt cost/complexity reasons, not something to casually increase
  without its own distinct justification; this fix works within the
  existing budget rather than expanding it.
- No new test: this is a search-window widening to already-covered
  gathering functions (server-only, real DB calls — same testing-
  boundary precedent as every other search-parameter change in this
  file), not new branching logic.
- Verified: `tsc --noEmit` clean, `eslint` clean, 224 unit tests
  unchanged and passing.

## Fix: Trainer candidates had the same undersampling gap as Pokémon, plus no broad fallback at all

- Same evidence-based check as the Pokémon fix, applied to Trainers on
  request: `select count(*) from cards where supertype='Trainer' and
  legality_standard='legal'` → **448** legal Trainers actually exist.
  The pipeline's structural ceiling before this fix was 15 (named
  staples, 1 each) + 8 (role-based draw/search, 4 each) = 23 max
  possible distinct candidates, with real staple successes landing
  around 13 — a similar order-of-magnitude undersampling as the
  15-of-466 Pokémon gap.
- **Worse than the Pokémon case in one respect**: Pokémon had a broad
  same-type fallback search (now widened); Trainers had *no broad
  fallback at all* — draw/search classification and 15 old-era names
  were the only paths in. Any real Trainer that wasn't draw-support,
  search-support, or one of those 15 specific names — Tools, Stadiums,
  disruption cards, additional search/draw variants beyond the first
  few found — was structurally invisible regardless of how large the
  real legal pool was.
- Fixed by extending `findRoleBasedTrainerCandidates` with a third,
  genuine catch-all bucket (`other`): every legal Trainer that doesn't
  classify as draw or search still gets picked up, up to a separate cap,
  from the same widened fetch (pageSize 100→300). Generation path:
  `perRole` 4→8, new `otherCount` 15 (max ~31 from this one step,
  proportionate to the 80-candidate budget). Review path: `perRole` 3→5,
  `otherCount` 6 (scaled down to fit its smaller 30-candidate budget).
- Extended diagnostics to match: `roleBasedOtherNames` alongside the
  existing draw/search name lists, so the actual breadth of what's being
  surfaced is directly visible in the generation log, not just a total
  count.
- No new test: same testing-boundary precedent as every other search-
  window change in this file (server-only, real DB calls).
- Verified: `tsc --noEmit` clean, `eslint` clean, 224 unit tests
  unchanged and passing.

## Addition: Special Energy candidates

- Follow-up to the Basic Energy candidate check — confirmed 317 legal
  Energy cards exist overall, but that count wasn't directly actionable
  since it spans all types and Energy diversity doesn't constrain a
  deck the way Pokémon/Trainer diversity does (Basic Energy has no copy
  limit, so one legal candidate is functionally enough). What the check
  did surface: the Energy search only ever looked for `isBasicEnergy`
  cards — Special Energy (acceleration, dual-type, utility-effect Energy
  cards) was never searched for at all, a real strategic category
  missing entirely rather than an undersampling of one that already
  existed.
- Added a dedicated Special Energy step to both
  `gatherDeckGenerationCandidates` and `gatherCandidateCards`:
  `supertype: "Energy"` with no `pokemonType` filter (deliberately
  broad — many Special Energy cards aren't tied to a specific elemental
  type the way Basic Energy is, so a type-scoped search would miss them
  even when relevant), filtered to `!isBasicEnergy(card)`. Generation:
  pageSize 60, take 6. Review: pageSize 60, take 4 (scaled to its
  smaller budget). Not gated on "energy count looks low" the way the
  Basic Energy step is — Special Energy is a strategic choice
  independent of raw Energy count.
- No changes needed to copy-limit or Energy-cap enforcement: Special
  Energy already correctly goes through the normal 4-copy limit in
  `buildVerifiedGeneratedDeck` (only exempted for `isBasicEnergy` cards,
  which Special Energy isn't), and the `maxEnergyCount` cap already
  applies to every Energy-supertype card regardless of Basic/Special —
  both were already correct, this just makes Special Energy reachable
  as a candidate at all.
- No new test: same testing-boundary precedent as every other search-
  parameter addition in this file.
- Verified: `tsc --noEmit` clean, `eslint` clean, 224 unit tests
  unchanged and passing.

## Diagnostic: raw vs. verified card count, to distinguish under-generation from silent verification drops

- Real production case: candidate pool is now genuinely rich (78 total,
  34 Pokémon, 36 Trainer, 8 Energy) and every composition ratio check
  passed — the only remaining hard issue was `TOTAL_CARD_COUNT_LOW` (52,
  then 54 of 60). The model's own explanation claimed "the 16/24/10
  split sums to exactly 60," directly contradicting the verified deck's
  actual count — a real discrepancy worth explaining before guessing at
  a fix, since it has two very different possible causes: the model's
  raw output was genuinely short despite its own claim, or the raw
  output really did total 60 and `buildVerifiedGeneratedDeck` silently
  dropped some entries (most likely a hallucinated/invalid cardId — the
  explanation named a specific ID, "Deoxys (me04-034)," that may or may
  not have actually been in `candidateCards`).
- Added logging to distinguish these before assuming either one:
  `rawEntryCount`/`rawCardCount` (summed straight from the model's own
  `raw.cards`, before any verification) vs. `verifiedCardCount` (after
  `buildVerifiedGeneratedDeck`), plus `droppedCardIds` — any cardId the
  model referenced that isn't actually in `candidatesById`, a real,
  checkable hallucination rather than an inference. Logged for both the
  initial compile and the refinement pass
  (`AI deck generation: raw vs verified card count` /
  `AI deck generation: refinement raw vs verified card count`).
- Deliberately did NOT implement a deterministic "top up existing
  choices to reach 60" fix yet, even though composition ratios landing
  perfectly while only the total falls short would make that technically
  easy — that would reverse an existing, deliberate, already-approved
  design decision ("Explicit design decision: never pad a short result
  up to 60... never silently topped up with generic energy or anything
  else the model didn't actually choose," from the original AI deck
  generation addition). Reversing an approved design decision needs an
  explicit decision, not a unilateral fix during a debugging session —
  flagged for the user to decide once the raw-vs-verified diagnostic
  shows which of the two actual causes this is.
- Verified: `tsc --noEmit` clean, `eslint` clean, 224 unit tests
  unchanged and passing (pure logging addition, no new branching logic).

## Addition: deterministic top-up to exactly 60 cards, per explicit user request

- User explicitly asked to force 60 cards, reversing the earlier
  "never pad" stance for this specific, now well-evidenced case: after
  every fix this session, a real generated deck had every composition
  check pass (Pokémon/Trainer/Energy all within archetype range,
  draw/search minimums met) and only the raw total falling short (52-54
  of 60), despite the model's own explanation claiming it summed to
  exactly 60.
- Added `topUpExistingCardsToSixty` (`verify-generation.ts`), run as a
  final Stage 5 after the existing construction + one bounded refinement
  pass, only if the deck is still short. It does NOT add any new card
  the model didn't choose — it only increases the quantity of entries
  already in the deck, which is a genuinely smaller liberty than
  inventing a new card, and doesn't actually conflict with the original
  "never fabricate content the model didn't select" principle: every
  card that ends up with a higher count is still one the model itself
  picked. Bounded the same way every other construction step already is:
  - Per-name copy limits (4, or a card's own special limit) are
    re-derived from the deck's current state and never exceeded.
  - Each category (Pokémon/Trainer/Energy) is never pushed past its own
    archetype range ceiling — this is what keeps the top-up from undoing
    the very composition checks that were already passing; it fills gaps
    within already-valid ranges rather than blindly maxing out whichever
    category has the most flexible limit.
  - If every entry is already maxed (copy limit and/or category
    ceiling) with the deck still short, the function stops gracefully —
    a genuinely thin candidate selection can still end up short, saved
    and flagged exactly as before, never silently claimed as a full 60
    it structurally couldn't reach.
- Wired into `generation-service.ts` as Stage 5, recomputing statistics
  and quality afterward so the logged/final state reflects the actual
  saved deck. Logged as `AI deck generation: deterministic top-up`
  (before/after totals, whether 60 was actually reached, final hard
  issue count).
- New tests in `verify-generation.test.ts`: no-op when already at 60;
  never introduces a new cardId; respects the per-name copy limit;
  respects each category's archetype range ceiling and stops gracefully
  rather than erroring when every entry is maxed; distributes a top-up
  across multiple entries in the same category rather than dumping it
  all into one; ignores an entry whose cardId no longer resolves to a
  real candidate without crashing.
- Verified: `tsc --noEmit` clean, `eslint` clean, 230 unit tests pass
  (224 previous + 6 new).

## Fix: real root cause of recurring truncation — adaptive thinking consuming the same max_tokens budget

- Real production failure #2 of the same shape: refinement call
  truncated mid-word again, despite the earlier 8192->16384 fix. Rather
  than double the number again and hope, checked Anthropic's own docs
  for Claude Sonnet 5 first.
- **Root cause**: Claude Sonnet 5 has adaptive thinking on by default —
  including for requests that never set the `thinking` parameter at
  all — and thinking tokens count toward the same `max_tokens` budget as
  the actual output. None of the three Anthropic calls in this app
  (`reviewDeck`, `planDeck`, `generateDeck`) ever configured `thinking`
  explicitly, so the real budget available for writing the JSON tool-call
  output was smaller than `max_tokens` alone suggested, by however many
  tokens the model spent reasoning first — worse for `generateDeck`
  specifically since its output (a 20-30-entry decklist plus a detailed
  explanation) is the largest of the three.
- The model supports up to 128k output tokens on the synchronous
  Messages API, so there was enormous unused headroom the whole time.
  `max_tokens` only sets a ceiling; actual usage/billing is based on
  tokens genuinely generated, not this number, so raising it generously
  is close to free insurance rather than a real cost.
- Fixed by raising every Anthropic call's `max_tokens` substantially
  rather than incrementally: `generateDeck` 16384→32768 (the one with
  two confirmed real failures), `reviewDeck` 8192→16384 and `planDeck`
  2048→4096 (defensive — same underlying cause applies uniformly to
  every call on this model, even though only `generateDeck` had actually
  failed twice).
- Added `stopReason` and `outputTokens` (from `response.usage.
  output_tokens`) to every schema-validation-failure log across all
  three calls, not just the "missing tool_use block" case that already
  had `stopReason`. `stop_reason === "max_tokens"` with `outputTokens`
  at or near the configured ceiling is now conclusive, checkable
  evidence of truncation on any future recurrence, rather than inferring
  it from a truncated JSON preview the way this fix had to.
- Deliberately did NOT explicitly disable thinking
  (`thinking: {type: "disabled"}`) — the task genuinely involves
  non-trivial constraint satisfaction (copy limits, archetype ranges,
  real candidate IDs, a coherent strategy), and there's no evidence
  disabling reasoning would improve rather than hurt output quality;
  the actual bug was an unaccounted-for budget interaction, not thinking
  being unwanted, so the fix addresses the budget rather than removing
  the reasoning.
- Verified: `tsc --noEmit` clean, `eslint` clean, 230 unit tests
  unchanged and passing (a numeric constant + logging change to live API
  calls, not new branching logic).

## Addition: Midrange and Toolbox battle-style archetypes

- User confirmed adding both proposed archetypes to fill real gaps in
  the original three (Aggro/Control/Mill) — Midrange (flexible, leans
  aggressive or defensive by matchup) and Toolbox (many diverse
  single-prize attackers, found via heavy search rather than one main
  line) are both established, numerically distinct competitive
  archetypes, not minor variations of an existing one.
- `StrategyArchetype` widened to `"aggro" | "control" | "mill" |
  "midrange" | "toolbox" | "other"` (`types/deck.ts`), with matching
  updates to `strategyArchetypeSchema` (`schemas/deck.ts`).
- Full `ArchetypeProfile` entries added to `archetype-profiles.ts`,
  following the same shape as the existing four:
  - **Midrange**: Pokémon 13-17, Trainer 23-28, Energy 11-15, draw≥7,
    search≥7, basic≥9, retreat ceiling 2.
  - **Toolbox**: Pokémon 10-14, Trainer 28-34, Energy 8-12, draw≥6,
    **search≥10** (the defining numeric trait — well above every other
    archetype, since search support is the backbone of the whole
    strategy, not just a consistency nicety), basic≥7 (lower — often
    single-stage attackers), retreat ceiling 2.
  - Both include a full `strategyDescription`, surfaced through the same
    `archetypeTargets` grounding mechanism already used for the original
    four — no separate wiring needed, since both `plan-prompt.ts` and
    `generation-prompt.ts` already pull the profile generically via
    `getArchetypeProfile`, and `deck-quality.ts` has no archetype-specific
    branching to update either.
- **Found and fixed a real display bug while auditing every place the
  archetype set was enumerated**: the public shared-deck page
  (`shared/[token]/page.tsx`) had a hardcoded aggro/control/mill ternary
  chain that silently fell through to "Other" for any other value —
  meaning a deck with `strategyArchetype: "midrange"` would have
  displayed as "Other" on its public share link even though the correct
  archetype was stored correctly in the database. Fixed alongside the
  addition, not left as a latent bug for whenever these two shipped.
- Updated both UI dropdowns that had the archetype list hardcoded (the
  AI deck generator form and the deck editor's own strategy selector) —
  found via a full-codebase grep for every archetype enumeration site
  rather than assuming only one place needed updating, given the shared
  page bug above was found exactly because of not assuming that.
- Also updated `prompt.ts`'s (AI review) own text description of valid
  `strategyArchetype` values, for accuracy — a stale enum list in
  prompt text wouldn't break anything functionally, but would silently
  under-describe what's actually possible.
- New tests in `deck-quality.test.ts` (mirroring the existing mill
  differentiation test): a deck with 8 search-support cards passes under
  the default profile but fails `LOW_SEARCH_SUPPORT` under toolbox's
  10-minimum; a deck with 22 Trainer cards passes under the default
  profile's wide 20-30 range but fails `TRAINER_COUNT_OUT_OF_RANGE`
  under midrange's tighter 23-28. `generation-archetype-targets.test.ts`
  updated to check all six archetypes get distinct descriptions (was
  four).
- Verified: `tsc --noEmit` clean, `eslint` clean, 232 unit tests pass
  (230 previous + 2 new... plus incidental coverage from the updated
  distinct-descriptions test).

## Fix: same Supporter cards recurring every generation — role/type buckets weren't deduped by name

- User reported the same 4 Supporters (Boss's Orders, Emma, Gwynn,
  Judge) showing up in effectively every generated deck. Traced directly
  to evidence already sitting in an earlier log rather than guessing
  fresh: a real `roleBasedDrawNames` array had shown `"Gwynn", "Gwynn",
  "Gwynn"` — the same card name three times.
- **Root cause**: neither `findRoleBasedTrainerCandidates`'s draw/search/
  other bucket-filling, nor the "other Pokémon sharing a type" searches,
  deduped by card NAME — only by card ID (via `addIfNew` downstream).
  Multiple printings of the exact same card (a reprint in one set, a
  different reprint in another) each independently satisfy
  `isDrawSupportCard` and would get pushed into a bucket separately, up
  to its small cap (`perRole`, or the same-type take-count). Since the
  model can only ever use 4 copies of one name regardless of how many
  printings are offered as separate candidates, a bucket partly filled
  with redundant printings of an already-represented name wastes most of
  its real diversity budget — exactly the mechanism that would make the
  same few heavily-reprinted staples dominate every generation
  regardless of target Pokémon, since Trainer candidates aren't even
  type-scoped to begin with. Identical shape of bug to the earlier
  "target Pokémon's own printings crowding the candidate pool" fix, just
  recurring in the role-based/type-based buckets instead.
- Fixed by adding `takeLegalDistinctByName` (alongside the existing
  `takeLegal`) — same legality filter, but also dedupes by normalized
  card name, keeping the first (most recent, since results sort
  newest-first) printing of each distinct name. Applied to both
  "other Pokémon sharing a type" searches (generation and review paths)
  and inlined directly into `findRoleBasedTrainerCandidates`'s
  draw/search/other bucket logic, since that function fills three
  buckets in one pass rather than a single slice.
- Deliberately did NOT change the 15 named-staple searches or the
  utility-Pokémon searches — each of those already searches for one
  specific name at a time, so name-level deduplication is moot there;
  only the broad, multi-result searches where genuine variety is the
  actual point needed this.
- New tests in `candidate-cards-name-matching.test.ts`: three printings
  of the same name count as one toward the cap (the exact reported
  scenario); the most recent printing is kept when a name repeats;
  case/quote-insensitive matching (reusing `normalizeCardName`, not a
  raw string compare); illegal printings are still filtered out before
  names are even considered; the cap applies to distinct names, not raw
  card count.
- Verified: `tsc --noEmit` clean, `eslint` clean, 237 unit tests pass
  (232 previous + 5 new).

## Fix: generalized the Energy-only ceiling cap to Pokémon and Trainer too

- Real production report: a generated deck landed at exactly 60/60
  cards (the top-up/60-card fix is working correctly) but badly
  miscomposed — 16 Pokémon / 38 Trainer / 6 Energy against a control
  archetype's 10-15 / 25-32 / 10-14 targets, and barely improved after
  refinement (16/36/8). The raw diagnostic showed why: `rawCardCount:
  138` — the model's raw output totaled more than double the 60-card
  target. `buildVerifiedGeneratedDeck` processes entries in whatever
  order the model listed them and simply stops once the running total
  hits 60 — a healthy design for a *modest* overshoot, but with a raw
  total this far over, the final composition becomes arbitrary rather
  than proportional: whichever categories the model happened to list
  first dominate the truncated result, regardless of what balance it
  may have actually intended.
- **Generalized the existing Energy-only ceiling cap** (added a few
  fixes ago for the "36 Energy vs 8-12 target" bug) to all three
  categories. `buildVerifiedGeneratedDeck`'s options grew from
  `{ maxEnergyCount }` to `{ maxEnergyCount, maxPokemonCount,
  maxTrainerCount }`, each sourced from the archetype's own range upper
  bound the same way Energy's already was. `generation-service.ts`'s
  `verify()` now passes all three. This makes an upper-bound composition
  violation for ANY category structurally impossible during
  construction, regardless of how badly the model overshoots the total
  or in what order it lists entries — not just Energy anymore, matching
  the same "enforcement by construction, not filtering after the fact"
  discipline already applied to copy limits, the 60-card cap, and
  (previously) Energy alone.
- Deliberately still NOT enforcing a floor for any category — a deck
  genuinely short on Pokémon or Trainer after this function stays short
  here, exactly as Energy already did; the existing hard quality checks
  (`POKEMON_COUNT_OUT_OF_RANGE` etc.) and the one bounded refinement pass
  remain the mechanism for pushing a category up toward its minimum,
  since inventing extra copies to hit a floor would violate the same
  "never fabricate content the model didn't choose" principle
  `topUpExistingCardsToSixty` was careful to respect.
- New tests in `verify-generation.test.ts` (renamed/expanded describe
  block): Pokémon total capped across multiple candidates; Trainer
  capped the same way; a direct reproduction of the reported scenario
  (Pokémon and Trainer entries listed before Energy, each requested well
  above what any sane deck would run, matching the real 138-card
  overshoot shape) confirming all three ceilings hold regardless of
  list order or overshoot severity; confirms no cap applies when the
  options are omitted (existing behavior preserved).
- Verified: `tsc --noEmit` clean, `eslint` clean, 241 unit tests pass
  (237 previous + 4 new).
