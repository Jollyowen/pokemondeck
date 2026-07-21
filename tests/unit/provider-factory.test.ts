import { describe, expect, it, beforeEach, vi } from "vitest";

const REQUIRED_ENV = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  POKEMON_TCG_API_KEY: "pokemon-key",
  AI_MODEL: "test-model",
};

describe("getDeckReviewProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of [...Object.keys(REQUIRED_ENV), "AI_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
      delete process.env[key];
    }
  });

  it("selects the Anthropic adapter when AI_PROVIDER=anthropic", async () => {
    Object.assign(process.env, REQUIRED_ENV, {
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-anthropic-key",
    });
    const { getDeckReviewProvider } = await import("@/lib/ai/provider-factory");
    const { anthropicReviewProvider } = await import("@/lib/ai/providers/anthropic");
    expect(getDeckReviewProvider()).toBe(anthropicReviewProvider);
  });

  it("selects the OpenAI adapter when AI_PROVIDER=openai", async () => {
    Object.assign(process.env, REQUIRED_ENV, {
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai-key",
    });
    const { getDeckReviewProvider } = await import("@/lib/ai/provider-factory");
    const { openaiReviewProvider } = await import("@/lib/ai/providers/openai");
    expect(getDeckReviewProvider()).toBe(openaiReviewProvider);
  });
});

describe("getDeckGenerationProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of [...Object.keys(REQUIRED_ENV), "AI_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
      delete process.env[key];
    }
  });

  it("selects the Anthropic generation adapter when AI_PROVIDER=anthropic", async () => {
    Object.assign(process.env, REQUIRED_ENV, {
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-anthropic-key",
    });
    const { getDeckGenerationProvider } = await import("@/lib/ai/provider-factory");
    const { anthropicDeckGenerationProvider } = await import("@/lib/ai/providers/anthropic");
    expect(getDeckGenerationProvider()).toBe(anthropicDeckGenerationProvider);
  });

  it("selects the OpenAI generation adapter when AI_PROVIDER=openai", async () => {
    Object.assign(process.env, REQUIRED_ENV, {
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai-key",
    });
    const { getDeckGenerationProvider } = await import("@/lib/ai/provider-factory");
    const { openaiDeckGenerationProvider } = await import("@/lib/ai/providers/openai");
    expect(getDeckGenerationProvider()).toBe(openaiDeckGenerationProvider);
  });
});
