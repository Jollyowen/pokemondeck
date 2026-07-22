/**
 * Standalone sync script — fetches the full Pokémon TCG catalogue (every
 * set, every card) and upserts it into the local `sets` and `cards`
 * tables. Run via the scheduled GitHub Actions workflow
 * (.github/workflows/sync-cards.yml), never through the running app or a
 * public endpoint.
 *
 * Usage: npm run sync-cards
 *
 * Required environment variables (see .env.example):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   POKEMON_TCG_API_KEY
 *
 * Deliberately does NOT reuse src/lib/supabase/server.ts or
 * src/lib/cards/local-card-repository.ts directly — both depend on
 * getServerEnv(), which validates the app's FULL environment (every AI
 * key, every other secret), not just the three this script actually
 * needs. Instead this constructs its own minimal Supabase client and
 * calls the shared, dependency-free row-mapping functions directly.
 *
 * Paced deliberately: the Pokémon TCG API caps authenticated requests at
 * 30/minute (per their docs). A full sync is 175-250+ requests (one per
 * set for the set list, roughly one per set for its cards, more for sets
 * with 250+ cards) — firing them back-to-back with no delay reliably
 * trips the limit partway through a run, which is exactly what happened
 * the first time this ran for real. REQUEST_INTERVAL_MS keeps this
 * comfortably under that cap; retryWithBackoff absorbs whatever transient
 * failures still happen (rate-limit blips, momentary server errors)
 * rather than aborting the whole run over one bad request.
 */
import { createClient } from "@supabase/supabase-js";
import { createPokemonTcgApiProvider, PokemonTcgApiError } from "@/lib/providers/pokemon-tcg-api-core";
import { cardToRow, setToRow } from "@/lib/cards/card-row-mapping";

// ~24 requests/minute — comfortably under the documented 30/minute cap,
// leaving headroom for retries without tipping back over the limit.
const REQUEST_INTERVAL_MS = 2500;
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
 * (a rate-limit blip, a momentary 500) rather than aborting the entire
 * sync over one bad request. Always waits REQUEST_INTERVAL_MS before
 * returning, success or failure, so the pacing holds regardless of how
 * many retries a given request needed.
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
      const isRetryable = error instanceof PokemonTcgApiError;
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

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = requireEnv("POKEMON_TCG_API_KEY");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const provider = createPokemonTcgApiProvider(() => apiKey);

  console.log("Fetching sets...");
  const sets = await withPacingAndRetry("fetch sets", () => provider.getSets());
  console.log(`Found ${sets.length} sets.`);

  const { error: setsError } = await supabase
    .from("sets")
    .upsert(sets.map(setToRow), { onConflict: "id" });
  if (setsError) {
    console.error("Failed to upsert sets:", setsError);
    process.exit(1);
  }

  let totalCards = 0;
  const failedSets: string[] = [];

  for (const set of sets) {
    try {
      let page = 1;
      const pageSize = 250;

      for (;;) {
        const result = await withPacingAndRetry(`search cards (set ${set.id}, page ${page})`, () =>
          provider.searchCards({ setId: set.id, page, pageSize }),
        );
        if (result.cards.length === 0) break;

        const rows = result.cards.map((c) => cardToRow(c, set.releaseDate));
        const { error } = await supabase.from("cards").upsert(rows, { onConflict: "id" });
        if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

        totalCards += result.cards.length;
        if (result.cards.length < pageSize) break; // last page for this set
        page += 1;
      }
      console.log(`Synced set ${set.id} (${set.name}).`);
    } catch (error) {
      // Don't let one bad set abort the other 170+ — log it and move on.
      // Upserts are idempotent, so re-running the sync later (or the next
      // scheduled run) will naturally pick up anything missed here.
      console.error(
        `Giving up on set ${set.id} (${set.name}) after ${MAX_ATTEMPTS} attempts:`,
        error instanceof Error ? error.message : error,
      );
      failedSets.push(set.id);
    }
  }

  console.log(`Sync complete: ${sets.length} sets attempted, ${totalCards} cards synced.`);
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
