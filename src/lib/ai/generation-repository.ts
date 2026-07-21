import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function countGenerationsInLast24Hours(ownerId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("ai_deck_generations")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", since);
  return count ?? 0;
}

export async function recordGeneration(ownerId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  await supabase.from("ai_deck_generations").insert({ owner_id: ownerId });
}
