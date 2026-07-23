import type { Card, CardSet } from "@/types/card";

export type CardDetailsJson = {
  imageSmall: string;
  imageLarge: string;
  abilities: Card["abilities"];
  attacks: Card["attacks"];
  weaknesses: Card["weaknesses"];
  resistances: Card["resistances"];
  retreatCost: string[];
  convertedRetreatCost: number;
  rules: string[];
  price: Card["price"];
};

export type CardRow = {
  id: string;
  provider: string;
  name: string;
  supertype: string;
  subtypes: string[];
  types: string[];
  set_id: string;
  set_name: string;
  set_release_date: string;
  rarity: string | null;
  hp: number | null;
  number: string | null;
  evolves_from: string | null;
  evolves_to: string[];
  legality_standard: string;
  legality_expanded: string;
  legality_unlimited: string;
  details: CardDetailsJson;
};

export type SetRow = {
  id: string;
  provider: string;
  name: string;
  series: string;
  release_date: string;
};

/** Card -> local database row, used when writing (sync script, or a live-fallback write-back). */
export function cardToRow(card: Card, setReleaseDate: string): CardRow {
  return {
    id: card.id,
    provider: card.provider,
    name: card.name,
    supertype: card.supertype,
    subtypes: card.subtypes,
    types: card.types,
    set_id: card.setId,
    set_name: card.setName,
    set_release_date: setReleaseDate,
    rarity: card.rarity,
    hp: card.hp,
    number: card.number || null,
    evolves_from: card.evolvesFrom,
    evolves_to: card.evolvesTo,
    legality_standard: card.legalities.standard,
    legality_expanded: card.legalities.expanded,
    legality_unlimited: card.legalities.unlimited,
    details: {
      imageSmall: card.imageSmall,
      imageLarge: card.imageLarge,
      abilities: card.abilities,
      attacks: card.attacks,
      weaknesses: card.weaknesses,
      resistances: card.resistances,
      retreatCost: card.retreatCost,
      convertedRetreatCost: card.convertedRetreatCost,
      rules: card.rules,
      price: card.price,
    },
  };
}

/** Local database row -> Card, used when reading. */
export function rowToCard(row: CardRow): Card {
  return {
    id: row.id,
    // BUG FIX: this used to unconditionally hardcode "pokemon_tcg_api"
    // here regardless of which provider actually synced the row — every
    // card read from the local database reported the same provider
    // string no matter its real source, which made `provider` useless
    // as evidence of whether a row was old pokemontcg.io-era data or a
    // fresh TCGdex sync. Now reads the row's own `provider` column,
    // which cardToRow (below) started actually writing at the same time
    // this was fixed. See DECISIONS.md for the full story — this is
    // also why "stale data" couldn't be confirmed from `provider` alone
    // before this fix.
    provider: row.provider as Card["provider"],
    name: row.name,
    number: row.number ?? "",
    setId: row.set_id,
    setName: row.set_name,
    imageSmall: row.details.imageSmall,
    imageLarge: row.details.imageLarge,
    supertype: row.supertype as Card["supertype"],
    subtypes: row.subtypes,
    types: row.types,
    hp: row.hp,
    evolvesFrom: row.evolves_from,
    evolvesTo: row.evolves_to,
    abilities: row.details.abilities,
    attacks: row.details.attacks,
    weaknesses: row.details.weaknesses,
    resistances: row.details.resistances,
    retreatCost: row.details.retreatCost,
    convertedRetreatCost: row.details.convertedRetreatCost,
    rules: row.details.rules,
    rarity: row.rarity,
    legalities: {
      standard: row.legality_standard as Card["legalities"]["standard"],
      expanded: row.legality_expanded as Card["legalities"]["expanded"],
      unlimited: row.legality_unlimited as Card["legalities"]["unlimited"],
    },
    price: row.details.price,
  };
}

export function setToRow(set: CardSet, provider: string): SetRow {
  return { id: set.id, provider, name: set.name, series: set.series, release_date: set.releaseDate };
}

export function rowToSet(row: SetRow): CardSet {
  return { id: row.id, provider: row.provider, name: row.name, series: row.series, releaseDate: row.release_date };
}
