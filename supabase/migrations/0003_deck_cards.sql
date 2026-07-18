create table deck_cards (
  deck_id uuid not null references decks(id) on delete cascade,
  card_id text not null,
  card_name text not null,
  quantity integer not null check (quantity > 0 and quantity <= 60),
  primary key (deck_id, card_id)
);
