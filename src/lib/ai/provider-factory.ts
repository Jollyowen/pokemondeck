import "server-only";
import { getServerEnv } from "@/lib/env";
import { anthropicReviewProvider, anthropicDeckGenerationProvider } from "@/lib/ai/providers/anthropic";
import { openaiReviewProvider, openaiDeckGenerationProvider } from "@/lib/ai/providers/openai";
import type { DeckGenerationProvider, DeckReviewProvider } from "@/types/deck";

export function getDeckReviewProvider(): DeckReviewProvider {
  const env = getServerEnv();
  return env.AI_PROVIDER === "openai" ? openaiReviewProvider : anthropicReviewProvider;
}

export function getDeckGenerationProvider(): DeckGenerationProvider {
  const env = getServerEnv();
  return env.AI_PROVIDER === "openai" ? openaiDeckGenerationProvider : anthropicDeckGenerationProvider;
}
