import "server-only";
import { getServerEnv } from "@/lib/env";
import type { CardProvider } from "@/types/card";
import { createPokemonTcgApiProvider } from "@/lib/providers/pokemon-tcg-api-core";

export * from "@/lib/providers/pokemon-tcg-api-core";

// Kept only in case this adapter is ever reinstated as a fallback — no
// current call site imports this export (the app now uses tcgdex-api.ts
// instead). POKEMON_TCG_API_KEY is optional in the env schema since
// nothing requires it at runtime anymore, so this falls back to an
// empty string; a real caller would fail loudly against the live API
// with a 401/403 rather than silently, which is the right failure mode
// for a currently-unused code path.
export const pokemonTcgApiProvider: CardProvider = createPokemonTcgApiProvider(
  () => getServerEnv().POKEMON_TCG_API_KEY ?? "",
);
