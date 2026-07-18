create table deck_reviews (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks(id) on delete cascade,
  deck_hash text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index deck_reviews_hash_idx on deck_reviews(deck_hash);
