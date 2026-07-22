import { test, expect } from "@playwright/test";
import { fixtureDeck, fixtureCard, fixtureReviewResult } from "../fixtures/deck-fixtures";

const deckCard = fixtureCard({ id: "deck-card-1", name: "Trainer A" });
const candidateCard = fixtureCard({ id: "candidate-1", name: "Trainer B", supertype: "Trainer" });

function mockDeckGet(route: import("@playwright/test").Route) {
  route.fulfill({
    json: {
      deck: fixtureDeck({ cards: [{ cardId: "deck-card-1", cardName: "Trainer A", quantity: 4 }] }),
      resolvedCards: { "deck-card-1": deckCard },
      validation: { status: "draft", issues: [] },
    },
  });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/sets", (route) => route.fulfill({ json: { sets: [] } }));
  await page.route("**/api/cards?*", (route) =>
    route.fulfill({ json: { cards: [], page: 1, pageSize: 12, totalCount: 0 } }),
  );
});

test("generating a review shows suggested swaps with real card names and images, not raw IDs", async ({ page }) => {
  await page.route("**/api/decks/deck-1", (route) => {
    if (route.request().method() === "GET") return mockDeckGet(route);
    route.abort();
  });
  await page.route("**/api/decks/deck-1/reviews/latest", (route) => route.fulfill({ json: { review: null } }));
  await page.route("**/api/decks/deck-1/review", (route) => {
    const result = fixtureReviewResult({
      suggestedSwaps: [
        {
          remove: [{ cardId: "deck-card-1", count: 4 }],
          add: [{ cardId: "candidate-1", count: 4 }],
          reason: "Better consistency.",
        },
      ],
    });
    route.fulfill({
      json: {
        result,
        resolvedCards: { "deck-card-1": deckCard, "candidate-1": candidateCard },
        cached: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
  });

  await page.goto("/decks/deck-1");
  await page.getByRole("button", { name: "Generate review" }).click();

  // Wait for the swap section to have actually rendered before checking
  // names — the Apply button only exists once suggestedSwaps has loaded.
  await expect(page.getByRole("button", { name: "Apply this swap" })).toBeVisible();

  await expect(page.getByText("deck-card-1")).not.toBeVisible();
  await expect(page.getByText("candidate-1")).not.toBeVisible();

  // Scoped to the swap's own list item — "Trainer A" is also the deck's
  // only card, so an unscoped match would trivially pass against the
  // deck list regardless of whether the swap section rendered at all.
  const swapItem = page.locator("li", { hasText: "Better consistency." });
  await expect(swapItem.getByText("Trainer A", { exact: true })).toBeVisible();
  await expect(swapItem.getByText("Trainer B", { exact: true })).toBeVisible();
});

test("applying a swap can only be actioned once", async ({ page }) => {
  await page.route("**/api/decks/deck-1", (route) => {
    if (route.request().method() === "GET") return mockDeckGet(route);
    if (route.request().method() === "PATCH") {
      route.fulfill({
        json: {
          deck: fixtureDeck(),
          resolvedCards: {},
          validation: { status: "draft", issues: [] },
        },
      });
      return;
    }
    route.abort();
  });
  await page.route("**/api/decks/deck-1/reviews/latest", (route) => route.fulfill({ json: { review: null } }));
  await page.route("**/api/decks/deck-1/review", (route) => {
    const result = fixtureReviewResult({
      suggestedSwaps: [
        {
          remove: [{ cardId: "deck-card-1", count: 4 }],
          add: [{ cardId: "candidate-1", count: 4 }],
          reason: "Better consistency.",
        },
      ],
    });
    route.fulfill({
      json: {
        result,
        resolvedCards: { "deck-card-1": deckCard, "candidate-1": candidateCard },
        cached: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });
  });

  await page.goto("/decks/deck-1");
  await page.getByRole("button", { name: "Generate review" }).click();

  const applyButton = page.getByRole("button", { name: "Apply this swap" });
  await expect(applyButton).toBeVisible();
  await applyButton.click();

  const appliedButton = page.getByRole("button", { name: "Applied ✓" });
  await expect(appliedButton).toBeVisible();
  await expect(appliedButton).toBeDisabled();
});
