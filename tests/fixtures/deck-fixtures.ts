/**
 * Shared fixture data for e2e tests. Not exhaustive — most unit tests
 * still define their own minimal fixtures inline, which is appropriate
 * for tightly-scoped pure-function tests. This file exists for e2e tests
 * that need a more complete, realistic deck/card shape to drive a mocked
 * API response.
 */

export function fixtureDeck(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "deck-1",
    ownerId: "owner-1",
    name: "Test Deck",
    format: "standard",
    status: "draft",
    shareEnabled: false,
    shareToken: null,
    cards: [],
    strategyArchetype: null,
    strategyNotes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

export function fixtureCard(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "swsh1-1",
    provider: "pokemon_tcg_api",
    name: "Charizard",
    number: "1",
    setId: "swsh1",
    setName: "Sword & Shield",
    imageSmall: "https://images.pokemontcg.io/swsh1/1.png",
    imageLarge: "https://images.pokemontcg.io/swsh1/1_hires.png",
    supertype: "Pokémon",
    subtypes: ["Basic"],
    types: ["Fire"],
    hp: 170,
    evolvesFrom: null,
    evolvesTo: [],
    abilities: [],
    attacks: [],
    weaknesses: [],
    resistances: [],
    retreatCost: [],
    convertedRetreatCost: 0,
    rules: [],
    rarity: "Rare Holo",
    legalities: { standard: "legal", expanded: "legal", unlimited: "legal" },
    price: null,
    ...overrides,
  };
}

export function fixtureReviewResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    summary: "A solid Fire-type deck with room to improve consistency.",
    strengths: [
      { title: "Strong single attacker", explanation: "Charizard hits hard.", evidenceCardIds: ["swsh1-1"] },
    ],
    issues: [],
    suggestedSwaps: [],
    confidence: "medium",
    limitations: ["Strategic review based on the submitted deck and card text."],
    ...overrides,
  };
}
