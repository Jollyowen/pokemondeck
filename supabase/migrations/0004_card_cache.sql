create table card_cache (
  provider text not null,
  card_id text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (provider, card_id)
);
