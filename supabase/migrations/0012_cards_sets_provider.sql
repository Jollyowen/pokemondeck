-- Adds provider tracking to sets/cards, fixing a real bug: rowToCard
-- previously hardcoded provider: "pokemon_tcg_api" on every row read
-- from the local database, regardless of which provider actually wrote
-- it. That made `provider` useless as evidence of whether a row was
-- genuinely old pokemontcg.io-era data or a fresh TCGdex sync — every
-- row reported the same string either way. See DECISIONS.md for the
-- full story (found while investigating a "duplicate sets" report,
-- which turned out not to be provable from `provider` at all as a
-- result of this bug).
--
-- Default 'unknown' rather than 'pokemon_tcg_api' for existing rows:
-- the TCGdex migration's sync runs (even the ones that crashed midway
-- on the evolvesTo pass) already completed their main per-set card
-- upserts first, successfully overwriting many existing rows with real
-- TCGdex data — those rows were already correct, just never correctly
-- labeled, because of this bug. 'unknown' is the honest label for "we
-- can't tell from history alone"; a completed sync after this
-- migration lands will correctly stamp every row it touches with the
-- real provider going forward, and anything still 'unknown' afterward
-- is provably a genuine leftover a TCGdex sync never touched.
alter table sets add column provider text not null default 'unknown';
alter table cards add column provider text not null default 'unknown';

create index cards_provider_idx on cards (provider);
