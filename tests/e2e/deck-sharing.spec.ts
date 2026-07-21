import { test, expect } from "@playwright/test";

test.describe("public shared deck page", () => {
  test("shows a not-found page for an invalid or revoked share token", async ({ page }) => {
    // No route mock needed — this hits the real dev server's route handler,
    // which will correctly report not-found for a token that doesn't exist.
    const response = await page.goto("/shared/does-not-exist-token");
    expect(response?.status()).toBe(404);
  });
});

test.describe("share panel in the deck editor", () => {
  const deckBase = {
    id: "deck-1",
    ownerId: "owner-1",
    name: "Test Deck",
    format: "standard",
    status: "draft",
    shareEnabled: false,
    shareToken: null,
    cards: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };

  test("enabling sharing displays a share URL and QR code", async ({ page }) => {
    await page.route("**/api/decks/deck-1", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          json: {
            deck: deckBase,
            resolvedCards: {},
            validation: { status: "draft", issues: [] },
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
    await page.route("**/api/decks/deck-1/share", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({ json: { shareUrl: "http://localhost:3000/shared/abc123", shareToken: "abc123" } });
        return;
      }
      route.continue();
    });

    await page.goto("/decks/deck-1");
    await page.getByRole("button", { name: "Enable sharing" }).click();

    // getByLabel matches the input's aria-label ("Shareable deck link");
    // toHaveValue is the correct Playwright assertion for an input's
    // value (there is no getByDisplayValue in Playwright's own API —
    // that's a Testing Library method, not one of ours).
    const shareUrlInput = page.getByLabel("Shareable deck link");
    await expect(shareUrlInput).toBeVisible();
    await expect(shareUrlInput).toHaveValue(/\/shared\/abc123$/);
    await expect(page.getByAltText("QR code linking to the shared deck")).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke sharing" })).toBeVisible();
  });

  test("revoking sharing removes the share URL after confirmation", async ({ page }) => {
    const sharedDeck = { ...deckBase, shareEnabled: true, shareToken: "abc123" };

    await page.route("**/api/decks/deck-1", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          json: { deck: sharedDeck, resolvedCards: {}, validation: { status: "draft", issues: [] } },
        });
        return;
      }
      route.continue();
    });
    await page.route("**/api/sets", (route) => route.fulfill({ json: { sets: [] } }));
    await page.route("**/api/cards?*", (route) =>
      route.fulfill({ json: { cards: [], page: 1, pageSize: 12, totalCount: 0 } }),
    );
    await page.route("**/api/decks/deck-1/share", (route) => {
      if (route.request().method() === "DELETE") {
        route.fulfill({ json: { revoked: true } });
        return;
      }
      route.continue();
    });

    page.on("dialog", (dialog) => dialog.accept());

    await page.goto("/decks/deck-1");
    await expect(page.getByRole("button", { name: "Revoke sharing" })).toBeVisible();
    await page.getByRole("button", { name: "Revoke sharing" }).click();

    await expect(page.getByRole("button", { name: "Enable sharing" })).toBeVisible();
  });
});
