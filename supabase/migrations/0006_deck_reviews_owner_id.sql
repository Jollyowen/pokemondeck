alter table deck_reviews
  add column owner_id uuid references owners(id) on delete cascade;

create index deck_reviews_owner_id_created_at_idx on deck_reviews(owner_id, created_at);
