import { z } from "zod";
import { deckFormatSchema } from "@/schemas/deck";

export const cardSearchSchema = z.object({
  name: z.string().trim().max(100).optional(),
  supertype: z.enum(["Pokémon", "Trainer", "Energy"]).optional(),
  pokemonType: z.string().trim().max(30).optional(),
  setId: z.string().trim().max(50).optional(),
  rarity: z.string().trim().max(50).optional(),
  format: deckFormatSchema.optional().default("all"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(24),
});

export type CardSearchQuery = z.infer<typeof cardSearchSchema>;
