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
 */
import { createClient } from "@supabase/supabase-js";
import { createPokemonTcgApiProvider } from "@/lib/providers/pokemon-tcg-api-core";
import { cardToRow, setToRow } from "@/lib/cards/card-row-mapping";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
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
  const sets = await provider.getSets();
  console.log(`Found ${sets.length} sets.`);

  const { error: setsError } = await supabase
    .from("sets")
    .upsert(sets.map(setToRow), { onConflict: "id" });
  if (setsError) {
    console.error("Failed to upsert sets:", setsError);
    process.exit(1);
  }

  let totalCards = 0;
  for (const set of sets) {
    let page = 1;
    const pageSize = 250;

    for (;;) {
      const result = await provider.searchCards({ setId: set.id, page, pageSize });
      if (result.cards.length === 0) break;

      const rows = result.cards.map((c) => cardToRow(c, set.releaseDate));
      const { error } = await supabase.from("cards").upsert(rows, { onConflict: "id" });
      if (error) {
        console.error(`Failed to upsert cards for set ${set.id}, page ${page}:`, error);
        process.exit(1);
      }

      totalCards += result.cards.length;
      if (result.cards.length < pageSize) break; // last page for this set
      page += 1;
    }
    console.log(`Synced set ${set.id} (${set.name}).`);
  }

  console.log(`Sync complete: ${sets.length} sets, ${totalCards} cards.`);
}

main().catch((error) => {
  console.error("Sync failed:", error);
  process.exit(1);
});
