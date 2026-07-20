import type { Card, DeckFormat } from "@/types/card";
import type { DeckReviewCard } from "@/types/deck";

export function toDeckReviewCard(card: Card, count: number, format: DeckFormat): DeckReviewCard {
  return {
    id: card.id,
    name: card.name,
    count,
    supertype: card.supertype,
    subtypes: card.subtypes,
    types: card.types,
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
