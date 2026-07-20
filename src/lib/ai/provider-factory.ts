import "server-only";
import { getServerEnv } from "@/lib/env";
import { anthropicReviewProvider } from "@/lib/ai/providers/anthropic";
import { openaiReviewProvider } from "@/lib/ai/providers/openai";
import type { DeckReviewProvider } from "@/types/deck";

export function getDeckReviewProvider(): DeckReviewProvider {
  const env = getServerEnv();
  return env.AI_PROVIDER === "openai" ? openaiReviewProvider : anthropicReviewProvider;
}
