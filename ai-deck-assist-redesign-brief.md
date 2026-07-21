# AI Deck Assist — Redesign Brief

## 1. What's actually wrong with the current approach

Worth being honest about this before proposing a fix. The current pipeline is:

`gather ~80 candidates → one AI call asks for a full 60-card list → deterministic
cleanup (drop hallucinated IDs, cap copy limits, cap at 60, force in missing
evolution prerequisites)`

That deterministic cleanup layer is genuinely solid — it's *why* the app can
say with confidence that a generated deck never exceeds a copy limit, never
invents a card, and never lacks an evolution's Basic form. But every bug
we've actually hit (missing target Pokémon, no Energy, lopsided
Trainer-heavy decks) came from the same root issue: **the single AI call
is asked to do strategic planning and exact list compilation in one shot,
and only gets checked for legality after the fact, never for whether it's
actually a good deck.** The verification layer catches "is this allowed,"
never "is this any good." A deck that's legal but has 2 attackers and no
way to find them passes every current check.

So the redesign isn't really about the prompt wording — it's about adding
a layer that currently doesn't exist at all: **quality checking**, with a
bounded feedback loop back to the model when a generated deck fails it.

## 2. Proposed architecture: plan → compile → score → refine (bounded)

```
1. Gather candidates          (unchanged — already correct)
2. PROMPT A: Strategy plan    (new — structured, no card IDs yet)
3. PROMPT B: List compilation (new — turns the plan into cardId+count)
4. Deterministic construction (unchanged — copy limits, 60-cap, evolutions)
5. Deterministic quality scoring (new — the actual point of this redesign)
6. If it fails hard thresholds: ONE re-prompt with specific numeric
   feedback, then re-run steps 3-5. Cap at 2 total attempts, same
   discipline as everywhere else in this app that talks to an AI provider.
7. Return the deck either way, with the scoring results attached so the
   person can see exactly how "complete" it is — never silently hide a
   deck that still falls short after the retry.
```

Two AI calls instead of one sounds like it costs more, and it does — but a
strategy plan is a much smaller, cheaper generation than a full decklist,
and the whole point is that a bad plan compiled perfectly is still a bad
deck. Catching it at the planning stage, before 60 cards get chosen around
it, is cheaper than discovering it in the final scoring step and having to
regenerate everything.

## 3. The actual prompts

### Prompt A — Strategy Plan

**Purpose:** get the model to commit to a shape before committing to specific
cards, so the shape itself can be sanity-checked before 60 cards get built
around it.

**Input data (JSON block, same untrusted-data discipline as today):**
- `pokemonName`, `strategyArchetype`, `strategyNotes`, `format`
- A *summary* of the candidate pool, not the full card data yet — counts by
  role: how many draw-support candidates exist, how many search-support,
  how many Basic Energy of each relevant type, how many other Pokémon of
  the target's type(s), how many evolution-line members are available.
  (Keeps this prompt cheap and focused — full card text isn't needed to
  decide on a shape.)

**Instructions (paraphrased):**
> Propose a deck *plan*, not a decklist. Specify: the primary attacker
> line (by name, walking Basic -> final stage), any secondary Pokémon
> lines, a rough Pokémon/Trainer/Energy split that sums to 60, which
> Energy type(s) to run and roughly how many, and which Trainer roles to
> prioritize (draw, search, recovery, disruption) and roughly how many of
> each. Every named Pokémon must come from the candidate summary you were
> given — you may reference "a generic draw support card" without naming
> a specific one yet, since exact card choice happens in the next step.
> Justify the plan in 2-3 sentences grounded in the actual candidate
> counts you were given (e.g. "with 6 search-support candidates
> available, this plan leans on Ultra Ball-style search rather than pure
> draw").

**Output shape:** structured JSON — attacker line names, secondary lines,
target Pokémon/Trainer/Energy counts, Trainer role targets, energy types,
justification text. No card IDs at all yet.

### Prompt B — List Compilation

**Purpose:** turn the approved plan into actual cards. This is close to
today's existing generation prompt, but now scoped by a plan instead of
improvising the whole shape from scratch, and given the full candidate
card data (same as today).

**Input:** the plan from Prompt A + the full candidate pool (same shape as
today's `candidateCards`).

**Instructions:** materially the same rules as today (only real candidate
IDs, respect copy limits, respect the 60-card target) plus one new
constraint: **follow the approved plan's role targets** — e.g. if the plan
said ~16 Energy, don't turn in 4.

### Prompt C — Refinement (only runs if scoring fails, see section 5)

**Input:** the deck that failed scoring, the specific thresholds it missed
with actual numbers ("6 Trainers are draw support; format needs 8+"), and
the same candidate pool.

**Instructions:** "Adjust the existing decklist to address the listed
gaps, changing as few cards as possible. Same real-candidates-only rule."
This is structurally closer to the *swap suggestion* mechanism already
built for AI review than to a fresh generation — worth literally reusing
that machinery rather than building a third bespoke thing.

## 4. Deterministic checks — structural (already built, keep as-is)

- Every card ID is real (dropped otherwise)
- Copy limit respected per name (including special same-name limits)
- Never exceeds 60 cards
- Every non-Basic Pokémon has its evolution prerequisite present, when
  available in the candidate pool
- Format legality is tracked (non-destructively) but not enforced as a
  hard gate — consistent with the rest of the app

## 5. Deterministic checks — new, for quality/balance/"winning"

### Archetype needs real per-profile thresholds; type does not

Checked this against real decklists and deck-building guides rather than
assume. The finding splits cleanly in two:

**Archetype genuinely changes deck shape, substantially.** Real mill
decklists run as few as 8-11 Pokémon, ~40 Trainers, and 6-9 Energy — not a
minor variation on the aggro/control numbers, a fundamentally different
deck. A single flat threshold table would be actively wrong for at least
one of the three archetypes we support. So: per-archetype profiles below.

**Elemental type does not.** Nothing in real deck-building guidance ties
Energy count, Trainer count, or draw/search minimums to being Fire vs.
Water vs. Electric. What genuinely drives Energy count down is how much
search/draw/energy-acceleration support the deck actually has — a
well-documented pattern ("decks with strong consistency engines run as few
as 8-12 Energy," independent of type) — and that's a property of *which
cards got chosen*, not of the type itself. Building a static per-type
table would mean inventing numbers with no real grounding, which
contradicts the same "don't invent things without a basis" discipline
this whole app already follows. Proposing a **dynamic rule instead**: detect
energy-acceleration support (abilities/attacks whose text matches a
pattern like "attach ... Energy from your hand/discard" — the same kind of
versioned text-heuristic module already used for draw/search support
detection) and lower the effective Energy threshold when it's present,
regardless of type.

### Per-archetype threshold profiles

| | Aggro | Control | Mill | Other / unspecified |
|---|---|---|---|---|
| Pokémon | 14-18 | 10-15 | 8-12 | 15-20 |
| Trainer | 20-26 | 25-32 | 34-42 | 20-30 |
| Energy | 14-18 (lower if strong acceleration present) | 10-14 | 7-11 | 8-12 |
| Draw support minimum | 6 | 8 | 4 | 6 |
| Search support minimum | 8 (finding the attacker fast matters most) | 6 | 4 (disruption matters more than finding an attacker) | 6 |
| Basic Pokémon minimum | 10 | 8 | 6 | 8 |
| Avg. retreat cost ceiling before flagging | 1.5 (aggro wants to get in and out) | 2.5 (less urgent) | 2.5 | 2 |

These are starting points grounded in real deck-building consensus, not
tuned against actual play data (we don't have any) — a reasonable baseline
to build from and adjust, not a settled spec. "Other/unspecified" reuses
roughly the general modern-competitive-consensus numbers, since that's the
right default when no archetype was given at all.

### Structural checks (unchanged from the original proposal)

- Every card ID is real (dropped otherwise)
- Copy limit respected per name (including special same-name limits)
- Never exceeds 60 cards
- Every non-Basic Pokémon has its evolution prerequisite present, when
  available in the candidate pool
- Format legality is tracked (non-destructively) but not enforced as a
  hard gate — consistent with the rest of the app
- Evolution line completeness: every Stage 1/2 has >= 2 copies of its
  immediate prior stage, not just >= 1
- Attacker redundancy: at least one secondary way to attack, or >= 3
  copies across the primary line
- Prize-trade balance: flagged (not failed) if > 60% of Pokémon are
  multi-prize (ex/V/VMAX/VSTAR-style subtypes) — informational, since
  heavy multi-prize is a legitimate archetype choice, not a mistake

**Deliberately not attempted:** anything requiring live tournament/meta
data (win rates, popular matchups, "this counters X"). Same restriction as
the AI review feature, for the same reason.

## 5a. Decisions from your answers

- **AI call budget: 2-4 calls confirmed acceptable.** Proceeding with the
  plan -> compile -> (score) -> refine architecture in section 2 as-is.
- **A deck that still fails quality checks after the refinement pass is
  saved anyway, with issues flagged** — never blocked. This matches how
  every other incomplete/imperfect deck already works in this app (a
  manually-built 40-card deck isn't blocked either, it's shown as a draft
  with clear issues). The quality-check results will use the same
  `DeckValidationIssue`-style severity/message pattern already established,
  not a new, separate visual language.

## 5b. Manual composition override

New request: let the person directly specify exact Pokémon/Trainer/Energy
counts instead of relying on the archetype-derived range, for the cases
where they know better than a generic profile.

**Scope of the override — important design call:** it replaces *only* the
Pokémon/Trainer/Energy split, not the whole archetype quality profile.
Draw-support minimum, search-support minimum, Basic Pokémon minimum, and
the retreat-cost ceiling still come from whichever archetype is selected
(or the "Other" default if none). Reasoning: those checks aren't about
*how many* of each card type, they're about *what role* the deck can
fulfil — a manually-specified 15/25/20 split doesn't tell us anything
about whether the person still wants aggro-style low retreat costs or
control-style heavy disruption, so there's no honest way to override those
from three numbers alone. Worth being explicit about this scoping rather
than let it silently disable checks the person didn't intend to turn off.

**UI:** an "Override composition" toggle on the AI Assist form, revealing
three number inputs (Pokémon, Trainer, Energy) with a live running total
next to them. The three numbers must be non-negative integers summing to
**exactly 60** — validated both client-side (submit stays disabled until
the total is 60, so this never even reaches the server in a broken state)
and server-side (the same way every other request shape in this app is
validated, never trusting the client alone).

**How it flows through the pipeline:**
- **Prompt A (Strategy Plan):** when an override is present, the plan
  prompt receives it as an exact instruction ("target exactly N Pokémon,
  M Trainer, K Energy") rather than the archetype's range, and is told to
  hit it precisely rather than aim within a band.
- **Quality scoring (section 5):** the Pokémon/Trainer/Energy composition
  check switches from "falls within the archetype's range" to "matches
  the override target," with a small tolerance (+-2 per category) rather
  than demanding an exact hit — the compiled list still depends on which
  specific candidates are actually available, so exact-every-time isn't
  realistic to guarantee. A deviation beyond that tolerance becomes a
  flagged issue, same treatment as every other quality check — never a
  hard failure, consistent with the "flag, don't block" decision in 5a.
- **Sum-to-60 validation is the one exception to "always flag, never
  block"** in this whole feature: it's a structural input constraint on
  the *form*, not a strategic judgement call about the *deck*, so it's
  correct to simply prevent submission rather than generate something
  from numbers that couldn't possibly represent a legal deck in the first
  place.

## 6. Feedback loop mechanics

- Run steps 1-5 once. If **any hard-threshold check fails**, run Prompt C
  exactly once with the specific numeric gaps. Re-score the result.
- Cap at 2 total generation attempts (1 initial + 1 refinement), matching
  the "bounded, not open-ended" discipline used everywhere else an AI call
  happens in this app.
- If it still fails after the refinement pass, **return it anyway** with
  the quality issues clearly shown — never silently discard a deck the
  person is waiting on, and never claim success when it isn't one. This
  mirrors exactly how a deck can land as "draft" status today rather than
  being blocked outright.
- Rate limiting: this is now up to 2 AI calls (plan + compile) or 4 (with
  one refinement round) per "generate a deck" click, roughly double
  today's cost per generation. Worth revisiting
  `AI_DECK_GENERATION_LIMIT_PER_DAY`'s default downward (e.g. 3 -> 2) given
  the heavier real cost per generation, rather than leaving it as-is and
  quietly making the daily budget more expensive to use up.

## 7. What doesn't change

- Candidate gathering (already fixed to be non-destructive by format and
  to fetch enough results to actually find the right printing)
- The core "never invent a card ID" discipline
- The `sessionStorage`-passed explanation banner — though it should now
  surface the *plan's* justification text, which is more genuinely
  informative than today's post-hoc explanation of a list that was
  generated in one shot

## 8. Status — APPROVED

All open questions resolved:
- Archetype threshold ranges (section 5): approved as-is.
- Mill Energy/Trainer ranges: adjusted per feedback (7-11 / 34-42).
- AI call budget (2-4 calls): approved.
- Failed quality checks: save with issues flagged, never block: approved.
- Manual composition override (section 5b): approved, scoped to
  Pokémon/Trainer/Energy split only.
- "Other" archetype: uses the generic default profile, no inference from
  free-text notes.

This brief is ready to build against.
Once these are settled, next step is implementation — happy to proceed
whenever you're ready, or keep refining the brief further first.
