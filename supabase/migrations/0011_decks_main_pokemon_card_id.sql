-- User-specified "main" Pokémon for a deck, used to feature that card as
-- the top of the deck's stack thumbnail on the "Your decks" screen. Plain
-- text, no FK — same loose-reference pattern as deck_cards.card_id, since
-- card ids live in the locally-synced `cards` table (migration 0010),
-- not something decks.* has ever referenced directly.
alter table decks add column main_pokemon_card_id text;
