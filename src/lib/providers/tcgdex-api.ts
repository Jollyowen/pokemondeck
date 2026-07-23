import "server-only";
import type { CardProvider } from "@/types/card";
import { createTcgdexApiProvider } from "@/lib/providers/tcgdex-api-core";

export * from "@/lib/providers/tcgdex-api-core";

/**
 * No API key required (TCGdex is unauthenticated/free), so unlike
 * pokemon-tcg-api.ts this doesn't depend on getServerEnv() for a key —
 * only the `server-only` guard matters here, to keep this out of any
 * client bundle.
 */
export const tcgdexApiProvider: CardProvider = createTcgdexApiProvider();
