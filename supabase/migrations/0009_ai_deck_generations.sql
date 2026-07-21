create table ai_deck_generations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ai_deck_generations_owner_id_created_at_idx on ai_deck_generations(owner_id, created_at);
