import { z } from "zod";

/**
 * All environment variables the application depends on are declared and
 * validated here. Nothing outside this file should read from
 * `process.env` directly, so a missing or malformed variable fails fast,
 * in one place, with a message that says exactly what is wrong.
 */

const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url({
    message: "NEXT_PUBLIC_APP_URL must be a full URL, e.g. https://example.com",
  }),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: "NEXT_PUBLIC_SUPABASE_URL must be a full Supabase project URL",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, {
    message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required",
  }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, {
    message: "SUPABASE_SERVICE_ROLE_KEY is required (server-only, never expose to the client)",
  }),
  POKEMON_TCG_API_KEY: z.string().min(1, {
    message: "POKEMON_TCG_API_KEY is required",
  }),
  AI_PROVIDER: z.enum(["anthropic", "openai"], {
    errorMap: () => ({ message: 'AI_PROVIDER must be either "anthropic" or "openai"' }),
  }),
  AI_MODEL: z.string().min(1, { message: "AI_MODEL is required" }),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_REVIEW_LIMIT_PER_DAY: z.coerce
    .number()
    .int()
    .positive()
    .default(5),
  AI_DECK_GENERATION_LIMIT_PER_DAY: z.coerce
    .number()
    .int()
    .positive()
    .default(2),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

/**
 * Validates and returns server-side environment configuration.
 * Throws a single, readable error listing every problem found, rather than
 * failing on the first missing variable and hiding the rest.
 */
export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid or missing environment variables:\n${issues}\n\n` +
        "Check .env.example for the full list of required variables.",
    );
  }

  // Cross-field check: the selected AI provider's key must actually be present.
  if (parsed.data.AI_PROVIDER === "anthropic" && !parsed.data.ANTHROPIC_API_KEY) {
    throw new Error(
      "AI_PROVIDER is set to \"anthropic\" but ANTHROPIC_API_KEY is missing.",
    );
  }
  if (parsed.data.AI_PROVIDER === "openai" && !parsed.data.OPENAI_API_KEY) {
    throw new Error(
      "AI_PROVIDER is set to \"openai\" but OPENAI_API_KEY is missing.",
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Subset of env vars safe to use in browser code. */
export function getPublicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
