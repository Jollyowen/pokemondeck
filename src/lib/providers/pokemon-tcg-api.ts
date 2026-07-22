import "server-only";
import { getServerEnv } from "@/lib/env";
import type { CardProvider } from "@/types/card";
import { createPokemonTcgApiProvider } from "@/lib/providers/pokemon-tcg-api-core";

export * from "@/lib/providers/pokemon-tcg-api-core";

export const pokemonTcgApiProvider: CardProvider = createPokemonTcgApiProvider(
  () => getServerEnv().POKEMON_TCG_API_KEY,
);
