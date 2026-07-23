/**
 * Standalone sync script — fetches the full Pokémon TCG catalogue (every
 * set, every card) from TCGdex and upserts it into the local `sets` and
 * `cards` tables. Run via the scheduled GitHub Actions workflow
 * (.github/workflows/sync-cards.yml), never through the running app or a
 * public endpoint.
 *
 * Usage: npm run sync-cards
 *
 * Required environment variables (see .env.example):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * (POKEMON_TCG_API_KEY is no longer required — TCGdex needs no API key.
 * Left in .env.example as optional/unused rather than removed outright,
 * in case the pokemontcg.io adapter is ever needed again as a fallback.)
 *
 * Deliberately does NOT reuse src/lib/supabase/server.ts or
 * src/lib/cards/local-card-repository.ts directly — both depend on
 * getServerEnv(), which validates the app's FULL environment (every AI
 * key, every other secret), not just what this script actually needs.
 * Instead this constructs its own minimal Supabase client and calls the
 * shared, dependency-free row-mapping functions directly.
 *
 * Paced defensively even though TCGdex documents no per-key rate limit
 * (it's unauthenticated) — courtesy to a free, community-run service,
 * and cheap insurance against an undocumented limit. Lighter pacing than
 * the old pokemontcg.io sync used, since there's no known 30/minute cap
 * to respect here.
 */
import { createClient } from "@supabase/supabase-js";
import { createTcgdexApiProvider, TcgdexApiError } from "@/lib/providers/tcgdex-api-core";
import { cardToRow, setToRow } from "@/lib/cards/card-row-mapping";
import type { Card } from "@/types/card";

const REQUEST_INTERVAL_MS = 250;
const MAX_ATTEMPTS = 4;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs fn with retry + exponential backoff (2s, 4s, 8s, ...) on top of
 * the fixed pacing delay above — for absorbing transient failures
 * (a momentary 5xx, a dropped connection) rather than aborting the
 * entire sync over one bad request. Always waits REQUEST_INTERVAL_MS
 * before returning, success or failure, so the pacing holds regardless
 * of how many retries a given request needed.
 */
async function withPacingAndRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await fn();
      await sleep(REQUEST_INTERVAL_MS);
      return result;
    } catch (error) {
      lastError = error;
      const isRetryable = error instanceof TcgdexApiError;
      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        await sleep(REQUEST_INTERVAL_MS);
        throw error;
      }
      const backoffMs = REQUEST_INTERVAL_MS * 2 ** attempt;
      console.warn(
        `${label}: attempt ${attempt}/${MAX_ATTEMPTS} failed (${
          error instanceof Error ? error.message : "unknown error"
        }), retrying in ${Math.round(backoffMs / 1000)}s...`,
      );
      await sleep(backoffMs);
    }
  }
  throw lastError;
}

/**
 * `evolvesTo` reverse-index pass.
 *
 * TCGdex only gives the reverse pointer (`evolveFrom`); there is no
 * forward `evolvesTo` field to fetch directly (see DECISIONS.md and
 * tcgdex-api-core.ts's normalizeCard doc comment for the full
 * reasoning). Every card synced in this run comes through here with
 * evolvesTo already normalized to `[]`; this function derives the real
 * value in memory and returns an id -> evolvesTo[] map for the caller
 * to fold back into each row before upserting.
 *
 * Matching is by name only — the same accepted limitation already
 * documented for the existing evolution-line quick-add feature (two
 * unrelated cards can share a name; this can't distinguish them from
 * evolvesFrom/evolvesTo alone). Not attempting anything cleverer here,
 * for consistency with that existing, already-accepted tradeoff.
 *
 * This has to run as a second pass over the *whole* synced set, not
 * per-card inline during the main upsert loop: a card's evolvesTo can
 * only be known once every other card's evolveFrom has been seen, and
 * nothing guarantees a Basic is synced before the Stage 1/2 cards that
 * evolve from it.
 */
function buildEvolvesToIndex(cards: Card[]): Map<string, string[]> {
  // name (lowercased) -> ids of cards whose evolveFrom equals that name
  const byEvolveFromName = new Map<string, string[]>();
  for (const card of cards) {
    if (!card.evolvesFrom) continue;
    const key = card.evolvesFrom.toLowerCase();
    const existing = byEvolveFromName.get(key) ?? [];
    existing.push(card.id);
    byEvolveFromName.set(key, existing);
  }

  // For each card, its evolvesTo is: ids of every card whose evolveFrom
  // matches THIS card's own name.
  const evolvesToById = new Map<string, string[]>();
  for (const card of cards) {
    const evolvesTo = byEvolveFromName.get(card.name.toLowerCase());
    if (evolvesTo && evolvesTo.length > 0) {
      evolvesToById.set(card.id, evolvesTo);
    }
  }
  return evolvesToById;
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const provider = createTcgdexApiProvider();

  console.log("Fetching sets...");
  const sets = await withPacingAndRetry("fetch sets", () => provider.getSets());
  console.log(`Found ${sets.length} sets.`);

  const { error: setsError } = await supabase
    .from("sets")
    .upsert(sets.map((s) => setToRow(s, "tcgdex")), { onConflict: "id" });
  if (setsError) {
    console.error("Failed to upsert sets:", setsError);
    process.exit(1);
  }

  // Every card gathered in memory this run, kept around (in addition to
  // being upserted immediately per-set as before) specifically so the
  // evolvesTo pass below has the full picture once every set has synced.
  // This is the one place a full-catalogue-in-memory tradeoff is made
  // deliberately, for a one-off nightly/weekly script — ~20-30k cards of
  // normalized data is a trivial memory footprint for a GitHub Actions
  // runner, not something worth streaming around.
  const allSyncedCards: Card[] = [];
  // Needed so the evolvesTo write-back pass (which re-upserts full rows,
  // not partial ones — see comment below) can call cardToRow() the same
  // way the main loop does, without re-fetching each card's set.
  const releaseDateBySetId = new Map<string, string>();
  const failedSets: string[] = [];

  for (const set of sets) {
    releaseDateBySetId.set(set.id, set.releaseDate);
    try {
      const result = await withPacingAndRetry(`fetch cards (set ${set.id})`, () =>
        provider.searchCards({ setId: set.id, page: 1, pageSize: 999 }),
      );

      const rows = result.cards.map((c) => cardToRow(c, set.releaseDate));
      const { error } = await supabase.from("cards").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

      allSyncedCards.push(...result.cards);
      console.log(`Synced set ${set.id} (${set.name}): ${result.cards.length} cards.`);
    } catch (error) {
      // Don't let one bad set abort the rest — log it and move on.
      // Upserts are idempotent, so re-running the sync later (or the next
      // scheduled run) will naturally pick up anything missed here.
      console.error(
        `Giving up on set ${set.id} (${set.name}) after ${MAX_ATTEMPTS} attempts:`,
        error instanceof Error ? error.message : error,
      );
      failedSets.push(set.id);
    }
  }

  console.log(`Card sync complete: ${sets.length} sets attempted, ${allSyncedCards.length} cards synced.`);

  // Defense-in-depth: dedupe by id before anything downstream depends on
  // ids being unique within a single write batch. A real production bug
  // (see the eq: filter fix in tcgdex-api-core.ts) previously caused the
  // same card to be fetched under more than one "set" due to TCGdex's
  // laxist substring-match filter matching set.id=swsh1 against swsh10,
  // swsh11, etc. — which surfaced here as a Postgres "ON CONFLICT DO
  // UPDATE... twice" error. That root cause is now fixed at the source,
  // but deduping here costs nothing and guards against any other future
  // source of duplicate ids doing the same thing (last-write-wins).
  const uniqueSyncedCards = [...new Map(allSyncedCards.map((c) => [c.id, c])).values()];
  if (uniqueSyncedCards.length !== allSyncedCards.length) {
    console.warn(
      `Deduped ${allSyncedCards.length - uniqueSyncedCards.length} duplicate card id(s) before evolvesTo derivation.`,
    );
  }

  // Second pass: derive evolvesTo now that every successfully-synced
  // card's evolveFrom is known.
  //
  // IMPORTANT: this writes back FULL rows via cardToRow(), never a
  // partial {id, evolves_to} payload. An earlier version of this script
  // tried the partial-row approach on the theory that upserting against
  // an existing id would behave like a plain UPDATE, touching only the
  // supplied columns. That's wrong: Postgres constructs the full INSERT
  // row (and validates its NOT NULL constraints) *before* it evaluates
  // ON CONFLICT — so a payload missing `name`, `supertype`, etc. fails
  // with a not-null violation even when a matching row already exists,
  // which is exactly the failure hit in the first real run of this
  // script. Every card is already held in memory from the main loop
  // above, so re-deriving the full row here costs nothing extra.
  console.log("Deriving evolvesTo (reverse-index pass)...");
  const evolvesToIndex = buildEvolvesToIndex(uniqueSyncedCards);
  console.log(`Found evolvesTo data for ${evolvesToIndex.size} cards.`);

  const cardsNeedingUpdate = uniqueSyncedCards
    .filter((c) => evolvesToIndex.has(c.id))
    .map((c) => ({ ...c, evolvesTo: evolvesToIndex.get(c.id)! }));

  const UPDATE_BATCH_SIZE = 500;
  for (let i = 0; i < cardsNeedingUpdate.length; i += UPDATE_BATCH_SIZE) {
    const batch = cardsNeedingUpdate.slice(i, i + UPDATE_BATCH_SIZE);
    const fullRows = batch.map((c) =>
      cardToRow(c, releaseDateBySetId.get(c.setId) ?? "0000-00-00"),
    );
    const { error } = await supabase.from("cards").upsert(fullRows, { onConflict: "id" });
    if (error) {
      console.error(`Failed to write evolvesTo batch starting at index ${i}:`, error);
      process.exit(1);
    }
  }
  console.log("evolvesTo derivation complete.");

  if (failedSets.length > 0) {
    console.error(`${failedSets.length} set(s) failed and were skipped: ${failedSets.join(", ")}`);
    console.error("Re-run the sync to retry them — already-synced sets/cards are unaffected.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exit(1);
});
