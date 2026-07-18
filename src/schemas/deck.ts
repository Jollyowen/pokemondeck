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

export const updateDeckSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  format: deckFormatSchema.optional(),
  cards: z.array(deckCardEntrySchema).max(60).optional(),
});

export const duplicateDeckSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
});

export const shareDeckSchema = z.object({
  enabled: z.boolean(),
});

export type CreateDeckInput = z.infer<typeof createDeckSchema>;
export type UpdateDeckInput = z.infer<typeof updateDeckSchema>;
export type DuplicateDeckInput = z.infer<typeof duplicateDeckSchema>;
export type ShareDeckInput = z.infer<typeof shareDeckSchema>;
