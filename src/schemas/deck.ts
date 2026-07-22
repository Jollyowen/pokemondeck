import { z } from "zod";

export const deckFormatSchema = z.enum(["standard", "expanded", "all"]);

export const deckCardEntrySchema = z.object({
  cardId: z.string().min(1),
  cardName: z.string().min(1),
  quantity: z.number().int().positive().max(60),
});

export const createDeckSchema = z.object({
  name: z.string().trim().min(1, "Deck name is required").max(100),
  format: deckFormatSchema,
});

export const strategyArchetypeSchema = z.enum(["aggro", "control", "mill", "other"]);

export const updateDeckSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  format: deckFormatSchema.optional(),
  cards: z.array(deckCardEntrySchema).max(60).optional(),
  strategyArchetype: strategyArchetypeSchema.nullable().optional(),
  strategyNotes: z.string().trim().max(300).nullable().optional(),
  mainPokemonCardId: z.string().trim().min(1).nullable().optional(),
});

export const duplicateDeckSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
});

export const shareDeckSchema = z.object({
  enabled: z.boolean(),
});

export const generateDeckSchema = z.object({
  format: deckFormatSchema,
  strategyArchetype: strategyArchetypeSchema.nullable().optional(),
  pokemonName: z.string().trim().min(1, "A Pokémon name is required").max(100),
  strategyNotes: z.string().trim().max(300).nullable().optional(),
});

export type CreateDeckInput = z.infer<typeof createDeckSchema>;
export type UpdateDeckInput = z.infer<typeof updateDeckSchema>;
export type DuplicateDeckInput = z.infer<typeof duplicateDeckSchema>;
export type ShareDeckInput = z.infer<typeof shareDeckSchema>;
export type GenerateDeckInput = z.infer<typeof generateDeckSchema>;
