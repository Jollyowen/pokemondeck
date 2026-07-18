create table owners (
  id uuid primary key,
  created_at timestamptz not null default now()
);
