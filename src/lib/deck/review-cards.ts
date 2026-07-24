import type { Card, DeckFormat } from "@/types/card";
import type { DeckReviewCard } from "@/types/deck";
import { inferBasicEnergyType } from "@/lib/deck/validate";

/**
 * card.types is unreliable for Energy cards from TCGdex (empty for most
 * real Basic Energy printings — see isBasicEnergy's doc comment in
 * validate.ts). Sending an empty types array to the AI review model for
 * a card literally named "Fire Energy" makes the model do the type
 * inference itself from the name, when the app can just do it reliably
 * up front. Falls back to card.types unchanged for anything else
 * (Pokémon cards, or an Energy card that does have real type data).
 */
function typesForReview(card: Card): string[] {
  if (card.types.length > 0 || card.supertype !== "Energy") return card.types;
  const inferred = inferBasicEnergyType(card);
  return inferred ? [inferred] : [];
}

export function toDeckReviewCard(card: Card, count: number, format: DeckFormat): DeckReviewCard {
  return {
    id: card.id,
    name: card.name,
    count,
    supertype: card.supertype,
    subtypes: card.subtypes,
    types: typesForReview(card),
    hp: card.hp,
    evolvesFrom: card.evolvesFrom,
    abilities: card.abilities.map((a) => ({ name: a.name, text: a.text })),
    attacks: card.attacks.map((a) => ({
      name: a.name,
      cost: a.cost,
      convertedEnergyCost: a.convertedEnergyCost,
      damage: a.damage,
      text: a.text,
    })),
    retreatCost: card.convertedRetreatCost,
    weaknesses: card.weaknesses.map((w) => `${w.type} ${w.value}`),
    resistances: card.resistances.map((r) => `${r.type} ${r.value}`),
    rules: card.rules,
    legalInSelectedFormat: format === "all" ? null : card.legalities[format] === "legal",
  };
}
