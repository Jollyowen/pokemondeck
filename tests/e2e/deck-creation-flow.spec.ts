import { test, expect } from "@playwright/test";
import { fixtureDeck, fixtureCard } from "../fixtures/deck-fixtures";

test("creating a deck redirects to its editor and shows draft status", async ({ page }) => {
  await page.route("**/api/decks", (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({ status: 201, json: { deck: fixtureDeck({ id: "new-deck-id" }) } });
      return;
    }
    route.continue();
  });
  await page.route("**/api/decks/new-deck-id", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        json: {
          deck: fixtureDeck({ id: "new-deck-id" }),
          resolvedCards: {},
          validation: { status: "draft", issues: [{ code: "TOO_FEW_CARDS", severity: "warning", message: "Deck has 0 of 60 cards." }] },
        },
      });
      return;
    }
    route.continue();
  });
  await page.route("**/api/sets", (route) => route.fulfill({ json: { sets: [] } }));
  await page.route("**/api/cards?*", (route) =>
    route.fulfill({ json: { cards: [], page: 1, pageSize: 12, totalCount: 0 } }),
  );
  await page.route("**/api/decks/new-deck-id/reviews/latest", (route) =>
    route.fulfill({ json: { review: null } }),
  );

  await page.goto("/decks/new");
  await page.getByRole("button", { name: "Create deck" }).click();

  await expect(page).toHaveURL(/\/decks\/new-deck-id/);
  await expect(page.getByText("Draft")).toBeVisible();
  await expect(page.getByText("0 / 60 cards")).toBeVisible();
});

test("adding a card from search updates the deck list and total count", async ({ page }) => {
  const card = fixtureCard();

  await page.route("**/api/decks/deck-1", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        json: {
          deck: fixtureDeck(),
          resolvedCards: {},
          validation: { status: "draft", issues: [{ code: "TOO_FEW_CARDS", severity: "warning", message: "Deck has 0 of 60 cards." }] },
        },
      });
      return;
    }
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      route.fulfill({
        json: {
          deck: fixtureDeck({ cards: body.cards }),
          resolvedCards: { [card.id]: card },
          validation: { status: "draft", issues: [{ code: "TOO_FEW_CARDS", severity: "warning", message: "Deck has 1 of 60 cards." }] },
        },
      });
      return;
    }
    route.continue();
  });
  await page.route("**/api/sets", (route) => route.fulfill({ json: { sets: [] } }));
  await page.route("**/api/cards?*", (route) =>
    route.fulfill({ json: { cards: [card], page: 1, pageSize: 12, totalCount: 1 } }),
  );
  await page.route("**/api/decks/deck-1/reviews/latest", (route) => route.fulfill({ json: { review: null } }));

  await page.goto("/decks/deck-1");
  await expect(page.getByText("0 / 60 cards")).toBeVisible();

  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByText("1 / 60 cards")).toBeVisible();
});
