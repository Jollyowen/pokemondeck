-- Retiring card_cache: it was a reactive, partial cache (only populated
-- when a card happened to be searched or viewed). This migration replaces
-- it with a proactively, fully synced local mirror of the catalogue,
-- kept current by a scheduled sync job (see scripts/sync-cards.ts).
-- Keeping both would mean two overlapping "cached card data" sources with
-- different freshness guarantees, which is exactly the kind of
-- inconsistency worth avoiding rather than working around.
drop table if exists card_cache;

create table sets (
  id text primary key,
  name text not null,
  series text not null,
  release_date text not null,
  synced_at timestamptz not null default now()
);

create table cards (
  id text primary key,
  name text not null,
  supertype text not null,
  subtypes text[] not null default '{}',
  types text[] not null default '{}',
  set_id text not null references sets(id) on delete cascade,
  set_name text not null,
  set_release_date text not null,
  rarity text,
  hp integer,
  number text,
  evolves_from text,
  evolves_to text[] not null default '{}',
  legality_standard text not null default 'not_legal',
  legality_expanded text not null default 'not_legal',
  legality_unlimited text not null default 'not_legal',
  -- Everything not searched/filtered on directly (attacks, abilities,
  -- weaknesses, resistances, retreat cost, rules text, price, image
  -- URLs) — needed once a specific card is opened/added/reviewed, but
  -- doesn't need its own indexed column.
  details jsonb not null,
  synced_at timestamptz not null default now()
);

create extension if not exists pg_trgm;

-- Fuzzy/substring name search — the actual point of this migration.
create index cards_name_trgm_idx on cards using gin (name gin_trgm_ops);
create index cards_set_id_idx on cards (set_id);
create index cards_supertype_idx on cards (supertype);
create index cards_types_idx on cards using gin (types);
create index cards_rarity_idx on cards (rarity);
create index cards_set_release_date_idx on cards (set_release_date desc);
