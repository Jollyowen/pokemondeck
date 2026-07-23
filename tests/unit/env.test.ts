import { describe, expect, it, beforeEach, vi } from "vitest";

describe("getServerEnv", () => {
  const REQUIRED = {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    POKEMON_TCG_API_KEY: "pokemon-key",
    AI_PROVIDER: "anthropic",
    AI_MODEL: "claude-sonnet-5",
    ANTHROPIC_API_KEY: "anthropic-key",
  };

  beforeEach(() => {
    vi.resetModules();
    for (const key of Object.keys(process.env)) {
      if (key in REQUIRED || key === "OPENAI_API_KEY" || key === "AI_REVIEW_LIMIT_PER_DAY") {
        delete process.env[key];
      }
    }
  });

  it("parses successfully when all required variables are present", async () => {
    Object.assign(process.env, REQUIRED);
    const { getServerEnv } = await import("@/lib/env");
    const env = getServerEnv();
    expect(env.AI_PROVIDER).toBe("anthropic");
    expect(env.AI_REVIEW_LIMIT_PER_DAY).toBe(5);
  });

  it("throws a clear error when a required variable is missing", async () => {
    Object.assign(process.env, REQUIRED);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("parses successfully even when POKEMON_TCG_API_KEY is missing (optional since the TCGdex migration)", async () => {
    Object.assign(process.env, REQUIRED);
    delete process.env.POKEMON_TCG_API_KEY;
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).not.toThrow();
  });

  it("throws when AI_PROVIDER is anthropic but ANTHROPIC_API_KEY is missing", async () => {
    Object.assign(process.env, REQUIRED);
    delete process.env.ANTHROPIC_API_KEY;
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrow(/ANTHROPIC_API_KEY/);
  });
});
