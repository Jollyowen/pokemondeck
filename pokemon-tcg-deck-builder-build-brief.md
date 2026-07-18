# Pokémon TCG Deck Builder with AI Deck Review
## Implementation Brief for Claude Code or ChatGPT/Codex

## 1. Objective

Build a production-quality web application that allows users to:

1. Browse and search the Pokémon TCG card catalogue.
2. Build and save multiple 60-card decks.
3. Validate decks against deterministic deck-construction rules.
4. View useful deck statistics.
5. Share read-only decks using a URL and QR code.
6. Request an AI-generated review containing strengths, weaknesses and verified card-swap suggestions.

The application must remain fully useful without AI. Deck construction, validation, statistics, saving and sharing must all work independently of the AI review feature.

---

## 2. Required Technology Stack

Use this stack unless a platform constraint makes it impossible:

- **Application framework:** Next.js with TypeScript
- **UI:** React and Tailwind CSS
- **Database and anonymous ownership:** Supabase Postgres
- **Card data provider:** Pokémon TCG API
- **AI integration:** provider-agnostic service supporting either Anthropic Claude or OpenAI
- **Validation:** Zod
- **Testing:** Vitest for unit tests and Playwright for end-to-end tests
- **Deployment target:** Vercel for the application and Supabase for the database

Do not introduce additional frameworks, state-management libraries or infrastructure unless they solve a demonstrated requirement.

Use server-side API routes or server actions for all operations that require secrets, database access or calls to external AI services.

---

## 3. Product Scope

### 3.1 MVP features

The MVP must include:

- Card catalogue search and filtering
- Card detail view
- Deck builder
- Deterministic deck validation
- Anonymous single-browser ownership
- Multiple saved decks
- Deck library
- Deck statistics
- Read-only deck sharing
- QR-code generation
- Structured AI deck review
- Verified AI swap suggestions
- Responsive desktop and mobile UI
- Automated tests
- Setup and deployment documentation

### 3.2 Explicitly out of scope

Do not build these in the MVP:

- User accounts or social login
- Automatic cross-device synchronisation
- Live tournament-meta analysis
- Card purchasing or affiliate links
- Deck comments, ratings or public discovery
- Real-time collaborative editing
- Card-price comparison
- PTCGL or Limitless import/export
- Multiple card-data providers

The code should leave room for accounts and alternate card-data providers later, but these features must not be implemented during the MVP.

---

## 4. User Ownership Model

The MVP uses anonymous, single-browser ownership.

On first use:

1. Generate a cryptographically random owner UUID.
2. Store it in a secure, long-lived first-party cookie.
3. Create the matching owner record in the database when the first deck is saved.

This owner identity applies only to the current browser profile.

The UI must clearly state:

> Decks are saved to this browser. Use a share link to view a deck elsewhere. Account-based cross-device access is not included in this version.

Do not claim that anonymous decks automatically follow the user between devices.

All owner-only mutation endpoints must verify the owner cookie.

---

## 5. Card Data

Use the Pokémon TCG API through a server-side adapter.

Base URL:

```text
https://api.pokemontcg.io/v2
```

Use an API key from an environment variable:

```text
POKEMON_TCG_API_KEY
```

Never expose the key to the browser.

### 5.1 Internal card model

Do not pass raw provider responses throughout the application. Convert provider data into this internal model:

```ts
type CardLegality = "legal" | "not_legal" | "unknown";

type Card = {
  id: string;
  provider: "pokemon_tcg_api";
  name: string;
  number: string;
  setId: string;
  setName: string;
  imageSmall: string;
  imageLarge: string;
  supertype: "Pokémon" | "Trainer" | "Energy";
  subtypes: string[];
  types: string[];
  hp: number | null;
  evolvesFrom: string | null;
  abilities: Array<{
    name: string;
    text: string;
    type: string;
  }>;
  attacks: Array<{
    name: string;
    cost: string[];
    convertedEnergyCost: number;
    damage: string;
    text: string;
  }>;
  weaknesses: Array<{
    type: string;
    value: string;
  }>;
  resistances: Array<{
    type: string;
    value: string;
  }>;
  retreatCost: string[];
  convertedRetreatCost: number;
  rules: string[];
  legalities: {
    standard: CardLegality;
    expanded: CardLegality;
    unlimited: CardLegality;
  };
};
```

Missing provider values must be normalised to empty arrays or `null`, not left as `undefined`.

### 5.2 Card provider interface

Create an adapter interface so provider-specific logic stays isolated:

```ts
interface CardProvider {
  searchCards(input: CardSearchInput): Promise<CardSearchResult>;
  getCard(cardId: string): Promise<Card | null>;
  getCards(cardIds: string[]): Promise<Card[]>;
  getSets(): Promise<CardSet[]>;
}
```

The rest of the application must depend on this interface, not directly on Pokémon TCG API response types.

### 5.3 Search requirements

Users must be able to search and filter by:

- Name
- Supertype
- Pokémon type
- Set
- Rarity
- Selected format
- Page number

Search must be debounced in the UI.

Format filtering is non-destructive:

- Illegal cards remain visible.
- Illegal cards are visually muted and labelled.
- Changing the format never removes cards from a deck.
- The user receives a warning before adding an illegal card.
- “All” means no format restriction, not Unlimited format.

Cache card and set responses server-side. The application must still display previously cached card records when the upstream API is temporarily unavailable.

---

## 6. Deck Rules and Validation

All rules in this section must be implemented deterministically in TypeScript. Do not ask the AI model to determine whether a deck is legal.

### 6.1 Deck states

A deck has one of these states:

- **Draft:** fewer than 60 cards or contains unresolved errors
- **Complete:** exactly 60 cards and passes construction validation
- **Format legal:** complete and all cards are legal in the selected format

Users may save drafts.

AI review is available only when the deck contains exactly 60 cards. The review must still report format-legality problems if present.

### 6.2 Validation rules

Implement these rules:

1. A complete deck contains exactly 60 cards.
2. Copy limits are grouped by normalised card name, not provider card ID.
3. A deck may contain at most four cards with the same name.
4. Basic Energy cards are exempt from the four-copy limit.
5. Cards containing an explicit deck-construction limit in their rules text must obey that lower limit.
6. A complete deck must contain at least one Basic Pokémon.
7. Every card must exist in the card provider or local card cache.
8. Every card must be checked against the selected format.
9. Illegal cards produce format errors but are never silently removed.
10. Strategic ratios are warnings only. There is no mandatory Pokémon, Trainer and Energy ratio.

Normalise names by trimming whitespace and using a consistent case-folding strategy. Do not combine different names merely because they represent the same Pokémon character.

### 6.3 Validation output

Return structured validation results:

```ts
type DeckValidationIssue = {
  code:
    | "TOO_FEW_CARDS"
    | "TOO_MANY_CARDS"
    | "COPY_LIMIT_EXCEEDED"
    | "SPECIAL_COPY_LIMIT_EXCEEDED"
    | "NO_BASIC_POKEMON"
    | "CARD_NOT_FOUND"
    | "FORMAT_ILLEGAL";
  severity: "error" | "warning";
  message: string;
  cardIds?: string[];
};
```

The UI must show errors beside the deck and provide a summary count in the deck header.

---

## 7. Deck Builder

The deck builder must support:

- Add one card
- Remove one card
- Change quantity
- Remove all copies
- Group by Pokémon, Trainer and Energy
- Sort within groups
- Search while keeping the deck visible
- Keyboard-accessible Add and Remove controls
- Touch-friendly controls
- Undo for the most recent deck change
- Autosave after a short debounce
- Clear unsaved and saving states
- Confirmation before deleting a deck

Drag-and-drop may be added, but it must not be the only way to edit a deck.

The user must never lose deck changes because an AI request, card API request or image request failed.

---

## 8. Deck Library

Once at least one deck exists, the default landing screen is the deck library.

Each deck row or card must show:

- Name
- Selected format
- Total card count
- Validation status
- Last updated date

Actions:

- Open
- Duplicate
- Delete
- Share
- Generate QR code

The library must support sorting by:

- Last updated
- Name
- Format

---

## 9. Database Schema

Create migrations for the following tables.

### 9.1 Owners

```sql
create table owners (
  id uuid primary key,
  created_at timestamptz not null default now()
);
```

### 9.2 Decks

```sql
create table decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id) on delete cascade,
  name text not null,
  format text not null check (format in ('standard', 'expanded', 'all')),
  status text not null default 'draft'
    check (status in ('draft', 'complete', 'format_legal')),
  share_enabled boolean not null default false,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index decks_owner_id_idx on decks(owner_id);
create index decks_share_token_idx on decks(share_token);
```

### 9.3 Deck cards

```sql
create table deck_cards (
  deck_id uuid not null references decks(id) on delete cascade,
  card_id text not null,
  card_name text not null,
  quantity integer not null check (quantity > 0 and quantity <= 60),
  primary key (deck_id, card_id)
);
```

Store `card_name` as a validation snapshot, but always display current card data when available.

### 9.4 Card cache

```sql
create table card_cache (
  provider text not null,
  card_id text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (provider, card_id)
);
```

### 9.5 Deck reviews

```sql
create table deck_reviews (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks(id) on delete cascade,
  deck_hash text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index deck_reviews_hash_idx on deck_reviews(deck_hash);
```

Use soft deletion for decks through `deleted_at`.

Do not copy AI reviews when duplicating a deck.

---

## 10. Application API

Implement these endpoints or equivalent typed server actions.

### Card endpoints

```text
GET /api/cards
GET /api/cards/:id
GET /api/sets
```

### Deck endpoints

```text
GET    /api/decks
POST   /api/decks
GET    /api/decks/:id
PATCH  /api/decks/:id
DELETE /api/decks/:id
POST   /api/decks/:id/duplicate
POST   /api/decks/:id/share
DELETE /api/decks/:id/share
```

### Public sharing

```text
GET /api/shared-decks/:shareToken
```

Shared decks are read-only.

A visitor may duplicate a shared deck into their own anonymous library through a separate explicit action.

Never expose owner IDs through public responses.

### AI review

```text
POST /api/decks/:id/review
GET  /api/decks/:id/reviews/latest
```

All mutation endpoints must validate request bodies with Zod and verify ownership.

Return consistent error responses:

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

---

## 11. Sharing and QR Codes

Do not use the deck database ID as the public access token.

When sharing is enabled:

1. Generate a cryptographically random token with at least 128 bits of entropy.
2. Store it in `share_token`.
3. Set `share_enabled` to `true`.
4. Create a URL such as:

```text
https://your-domain.example/shared/<shareToken>
```

The shared page must:

- Be read-only
- Hide owner information
- Include deck name, format, cards, statistics and validation status
- Include a “Copy to my decks” action
- Use `noindex`
- Stop working immediately if sharing is revoked or the deck is deleted

The QR code must encode only the shared URL.

---

## 12. Deck Statistics

Compute deck statistics deterministically from card data.

Required statistics:

- Total Pokémon
- Total Trainer cards
- Total Energy cards
- Pokémon type distribution
- Energy type distribution
- Basic, Stage 1 and Stage 2 distribution
- Average retreat cost
- Attack energy-cost distribution
- Number of draw-support cards
- Number of search-support cards
- Number of format-illegal cards

Where a statistic depends on interpreting free text, mark it as an estimate and keep the detection logic in a versioned rules module.

Statistics must remain available without an AI provider.

---

## 13. AI Provider Architecture

Support Anthropic Claude or OpenAI through one shared interface.

```ts
interface DeckReviewProvider {
  reviewDeck(input: DeckReviewInput): Promise<DeckReviewResult>;
}
```

Use an environment variable to select the provider:

```text
AI_PROVIDER=anthropic
```

or:

```text
AI_PROVIDER=openai
```

Required provider secrets:

```text
ANTHROPIC_API_KEY
OPENAI_API_KEY
```

Only the selected provider key is required.

Keep provider-specific SDK code inside separate adapter files.

Do not expose AI keys to the browser.

Do not hard-code a model name throughout the application. Read it from:

```text
AI_MODEL
```

Validate at startup that the selected provider and required configuration are present.

---

## 14. AI Review Pipeline

The model must not receive the raw provider card objects.

Build a compact, gameplay-focused input containing one record per unique card:

```ts
type DeckReviewCard = {
  id: string;
  name: string;
  count: number;
  supertype: string;
  subtypes: string[];
  types: string[];
  hp: number | null;
  evolvesFrom: string | null;
  abilities: Array<{
    name: string;
    text: string;
  }>;
  attacks: Array<{
    name: string;
    cost: string[];
    convertedEnergyCost: number;
    damage: string;
    text: string;
  }>;
  retreatCost: number;
  weaknesses: string[];
  resistances: string[];
  rules: string[];
  legalInSelectedFormat: boolean | null;
};
```

Do not send:

- Images
- Prices
- Artist data
- Collector metadata
- Full set metadata
- Duplicate records for every copy
- Owner identifiers
- Share tokens

### 14.1 Review scope

The AI may assess:

- Strategy and likely win condition
- Evolution-line completeness
- Energy compatibility
- Setup speed
- Draw and search consistency
- Internal synergy
- Retreat burden
- Potential dead cards
- General strengths and weaknesses

The AI must not claim access to live tournament data.

Do not describe the result as current meta analysis.

Use wording such as:

> Strategic review based on the submitted deck and card text. This is not live tournament-meta analysis.

### 14.2 Structured result

Require schema-constrained output matching:

```ts
type DeckReviewResult = {
  summary: string;
  strengths: Array<{
    title: string;
    explanation: string;
    evidenceCardIds: string[];
  }>;
  issues: Array<{
    category:
      | "strategy"
      | "consistency"
      | "energy"
      | "evolution"
      | "draw_search"
      | "legality"
      | "retreat"
      | "other";
    severity: "low" | "medium" | "high";
    title: string;
    explanation: string;
    evidenceCardIds: string[];
  }>;
  suggestedSwaps: Array<{
    remove: Array<{
      cardId: string;
      count: number;
    }>;
    add: Array<{
      cardId: string;
      count: number;
    }>;
    reason: string;
  }>;
  confidence: "low" | "medium" | "high";
  limitations: string[];
};
```

Return two to four swap suggestions when suitable.

---

## 15. Verified Swap Suggestions

The AI must not invent replacement cards.

Before calling the model:

1. Analyse the deck deterministically.
2. Search the card provider for a bounded set of real cards relevant to the selected format and identified deck needs.
3. Supply these cards to the model as the only permitted additions.
4. Tell the model it may only reference supplied card IDs.
5. Verify every returned card ID.
6. Verify all quantities.
7. Simulate each proposed swap.
8. Reject a swap if the resulting deck has more or fewer than 60 cards.
9. Reject a swap if it violates a copy limit.
10. Reject a swap if an added card is illegal in the selected format.
11. Remove invalid suggestions before returning the result.

The interface must clearly show that suggestions are optional. Never apply a swap automatically.

If no valid candidate cards are available, return useful analysis without swap suggestions.

---

## 16. AI Review Caching and Limits

Generate a stable hash from:

- Sorted card IDs and quantities
- Selected format
- Validation result version
- Prompt version

Reuse an existing review when the hash matches.

A changed deck invalidates the displayed review.

Apply a configurable per-owner review limit:

```text
AI_REVIEW_LIMIT_PER_DAY
```

Display a friendly error when the limit is reached.

AI failure must never prevent users from editing, saving, viewing or sharing decks.

Log provider errors without recording owner cookies, secrets or unnecessary deck-name data.

---

## 17. Security and Privacy

Implement the following:

- Keep all external API secrets server-side.
- Validate every request with Zod.
- Verify deck ownership on every owner-only operation.
- Use random share tokens rather than sequential IDs.
- Rate-limit AI review requests.
- Rate-limit expensive card searches.
- Escape all user-generated deck names.
- Treat deck names and card text as untrusted model input.
- Separate instructions from data in AI prompts.
- Never allow model output to execute as HTML.
- Render AI text as escaped plain text or safe structured UI.
- Do not expose owner IDs, cookies or database internals publicly.
- Use parameterised database queries.
- Add `noindex` to shared pages.
- Include a short privacy notice.
- Include a visible statement that the application is unofficial and not endorsed by Nintendo, The Pokémon Company or Pokémon.

---

## 18. Accessibility and Responsive Behaviour

Target WCAG 2.2 AA.

Required behaviour:

- All deck actions usable with a keyboard.
- Visible focus states.
- Form controls have labels.
- Card legality is not communicated by colour alone.
- Images have meaningful alt text.
- Loading states are announced appropriately.
- Error messages are associated with the relevant controls.
- Mobile layouts avoid horizontal scrolling.
- Touch targets are at least 44 by 44 CSS pixels where practical.
- Reduced-motion preferences are respected.

---

## 19. Performance and Reliability Targets

Target these acceptance thresholds:

- Cached card searches respond within 500 ms at p75.
- Deck-library requests respond within 750 ms at p75.
- The application remains usable when card images fail.
- The application remains usable when the AI provider fails.
- Autosave begins within two seconds of the latest deck edit.
- Search requests are debounced and stale responses are ignored.
- Card lists use pagination or virtualisation.
- No API secret appears in client JavaScript or network responses.
- An identical unchanged deck does not trigger a duplicate AI request.

---

## 20. Build Phases

Complete each phase before starting the next.

Do not implement later-phase features early unless they are necessary foundations.

### Phase 1: Project foundation

Build:

- Next.js TypeScript project
- Tailwind configuration
- Environment validation
- Supabase connection
- Database migrations
- Shared application types
- Zod request schemas
- Basic responsive layout
- Test configuration

Completion criteria:

- Application starts locally.
- Database migrations run successfully.
- Unit and end-to-end test commands run.
- Missing required environment variables produce clear errors.

### Phase 2: Card catalogue

Build:

- Pokémon TCG API adapter
- Internal card normalisation
- Card cache
- Search endpoint
- Filter UI
- Pagination
- Card detail view
- Format legality labels
- Loading, empty and error states

Completion criteria:

- Users can search by name and filters.
- Provider responses are converted to the internal model.
- API keys are not visible client-side.
- Cached data is used where available.
- Search unit and end-to-end tests pass.

### Phase 3: Deck builder and validation

Build:

- Anonymous owner cookie
- Deck creation
- Deck editor
- Quantity controls
- Grouped deck list
- Autosave
- Undo
- Deterministic validation
- Draft, complete and format-legal states

Completion criteria:

- Users can save incomplete decks.
- Same-name cards across different printings share one copy limit.
- Basic Energy is exempt from the four-copy limit.
- Special copy limits are enforced.
- A complete deck requires at least one Basic Pokémon.
- Changing format never removes cards.
- Validation tests cover valid and invalid fixtures.

### Phase 4: Deck library

Build:

- Deck listing
- Sorting
- Open
- Rename
- Duplicate
- Soft delete
- Confirmation and undo where appropriate

Completion criteria:

- One anonymous owner can manage multiple decks.
- Another owner cannot access or mutate those decks.
- Duplicating a deck does not copy reviews.
- Deleted decks do not appear in the library.

### Phase 5: Statistics

Build the deterministic deck-statistics dashboard.

Completion criteria:

- Statistics update immediately after deck changes.
- Statistics do not require an AI API.
- Calculations have unit tests.

### Phase 6: Sharing and QR codes

Build:

- Enable sharing
- Revoke sharing
- Random share tokens
- Read-only public deck page
- Copy shared deck to current owner
- QR code

Completion criteria:

- Shared pages cannot mutate the original.
- Revoked and deleted links stop working.
- Public responses expose no owner data.
- QR code resolves to the shared page.
- Shared pages use `noindex`.

### Phase 7: AI review

Build:

- Provider-neutral review interface
- Anthropic adapter
- OpenAI adapter
- Structured output validation
- Candidate-card retrieval
- Verified swap suggestions
- Review hash and cache
- Review limits
- Review report UI

Completion criteria:

- The application works with either provider through configuration.
- Invalid model output is rejected safely.
- All suggested card IDs exist.
- All resulting swaps preserve 60 cards.
- All additions obey format and copy limits.
- AI failures do not affect core deck features.
- Reviews show confidence and limitations.

### Phase 8: Hardening and deployment

Build:

- Full Playwright coverage of primary flows
- Accessibility audit
- Error monitoring hooks
- Seed or fixture data for tests
- Production environment documentation
- Vercel deployment configuration
- Supabase migration instructions
- README and troubleshooting section

Completion criteria:

- A new developer or coding agent can set up the project from the README.
- CI runs linting, type checking, unit tests and end-to-end tests.
- Core flows pass in a production-like environment.
- No high-severity accessibility issue remains.

---

## 21. Required Automated Tests

At minimum, include tests for:

### Validation

- 59-card deck
- 60-card valid deck
- 61-card deck
- Same card name across different set printings
- Five copies of one non-Basic-Energy card
- More than four Basic Energy cards
- Special one-copy rule
- No Basic Pokémon
- Illegal card in Standard
- “All” format with no legality restriction

### Ownership

- Owner can list and edit own deck
- Owner cannot read another owner's private deck
- Owner cannot modify another owner's deck
- Shared deck can be read without owner credentials
- Shared deck cannot be mutated publicly

### Sharing

- Share token is non-sequential and high entropy
- Revoking sharing invalidates the URL
- Deleting a deck invalidates the URL
- Copying a shared deck creates a separate owned deck

### AI

- Provider selection works through configuration
- Invalid JSON or schema output fails safely
- Hallucinated card ID is removed
- Illegal addition is removed
- Copy-limit violation is removed
- Swap changing total away from 60 is removed
- Cached review is reused for an unchanged deck
- Changed deck invalidates the previous review

---

## 22. Coding-Agent Operating Instructions

These instructions are part of the brief and must be followed by Claude Code, ChatGPT/Codex or another coding agent.

1. Read the entire brief before changing code.
2. Inspect the existing repository before selecting an implementation approach.
3. Use the required stack and architecture.
4. Do not replace firm decisions with multiple options.
5. Do not broaden the MVP.
6. Work in the stated phase order.
7. At the start of each phase, list the files and components that phase will change.
8. Keep changes small and testable.
9. Run type checking, linting and relevant tests after each meaningful change.
10. Fix failures before continuing.
11. Do not use placeholder implementations for security, ownership, validation or AI verification.
12. Do not let AI determine deterministic deck rules.
13. Do not allow unverified model output into the interface.
14. Do not expose secrets in client code.
15. Keep provider-specific card and AI code behind adapters.
16. Add migrations rather than editing a production schema manually.
17. Update the README whenever setup or environment requirements change.
18. Record deliberate deviations from this brief in `DECISIONS.md`.
19. When blocked by a minor ambiguity, choose the simplest implementation consistent with this brief and document it.
20. Stop after completing the requested phase unless explicitly told to continue.

---

## 23. Environment Variables

Document these in `.env.example`:

```text
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
POKEMON_TCG_API_KEY=

AI_PROVIDER=anthropic
AI_MODEL=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
AI_REVIEW_LIMIT_PER_DAY=5
```

Do not place real secrets in `.env.example`.

---

## 24. Definition of Done

The MVP is done when:

- Users can browse and search the card catalogue.
- Users can create and manage multiple anonymous decks.
- Deck validation is deterministic and covered by tests.
- Users can save drafts and identify complete or format-legal decks.
- Deck statistics work without AI.
- Shared decks are read-only and revocable.
- QR codes open the correct shared deck.
- The application supports either Claude or OpenAI through configuration.
- AI output is structured, validated and safely rendered.
- Every AI card suggestion is verified against real card data and deck rules.
- The application remains usable during external API failures.
- Core user flows pass automated tests.
- Setup, environment configuration, migrations and deployment are documented.

---

## 25. Final Product Positioning

Use this wording in the application where appropriate:

> This is an unofficial Pokémon TCG deck-building tool. It is not produced, endorsed or supported by Nintendo, The Pokémon Company or Pokémon.

Use this wording beside the AI review:

> This strategic review is generated from the submitted deck and card text. It may be incomplete or incorrect and does not use live tournament-meta data.
