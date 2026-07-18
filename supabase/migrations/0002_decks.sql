create table decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id) on delete cascade,
  name text not null,
  format text not null check (format in ('standard', 'expanded', 'all')),
  status text not null default 'draft'
    check (status in ('draft', 'complete', 'format_legal')),
  share_enabled boolean not null default false,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index decks_owner_id_idx on decks(owner_id);
create index decks_share_token_idx on decks(share_token);
