alter table decks
  add column strategy_archetype text
    check (strategy_archetype in ('aggro', 'control', 'mill', 'other'));
