import { z } from "zod";

export const deckPlanSchema = z.object({
  attackerLine: z.array(z.string()),
  secondaryLines: z.array(z.array(z.string())),
  targetPokemon: z.number().int().positive(),
  targetTrainer: z.number().int().positive(),
  targetEnergy: z.number().int().positive(),
  energyTypes: z.array(z.string()),
  trainerRoleTargets: z.object({
    draw: z.number().int().nonnegative(),
    search: z.number().int().nonnegative(),
    utility: z.number().int().nonnegative(),
  }),
  justification: z.string().min(1),
});

export type RawDeckPlan = z.infer<typeof deckPlanSchema>;

export function parseAndValidatePlanOutput(rawText: string): RawDeckPlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }
  const result = deckPlanSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
