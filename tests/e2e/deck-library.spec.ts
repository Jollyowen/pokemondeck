import { test, expect } from "@playwright/test";

function deck(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "deck-1",
    name: "Charizard Control",
    format: "standard",
    status: "draft",
    cardCount: 42,
    updatedAt: "2026-07-01T12:00:00.000Z",
    mainPokemonCardId: null,
    mainPokemonImageSmall: null,
    energyTypes: [],
    ...overrides,
  };
}

test("shows an empty state when the owner has no decks", async ({ page }) => {
  await page.route("**/api/decks?*", (route) =>
    route.fulfill({ json: { decks: [] } }),
  );
  await page.goto("/decks");
  await expect(page.getByText("No decks yet")).toBeVisible();
});

test("lists decks with their status, format and card count", async ({ page }) => {
  await page.route("**/api/decks?*", (route) =>
    route.fulfill({ json: { decks: [deck()] } }),
  );
  await page.goto("/decks");
  // { exact: true }: the deck card also has an "Open <name>" icon-button
  // link, whose accessible name is a superstring of the bare deck name —
  // same strict-mode-ambiguity shape already hit (and fixed) elsewhere in
  // this suite, see DECISIONS.md.
  await expect(page.getByRole("link", { name: "Charizard Control", exact: true })).toBeVisible();
  await expect(page.getByText("42 / 60 cards")).toBeVisible();
  await expect(page.getByText("Draft")).toBeVisible();
});

test("renaming a deck sends the new name to the server", async ({ page }) => {
  await page.route("**/api/decks?*", (route) =>
    route.fulfill({ json: { decks: [deck()] } }),
  );

  let patchedBody: unknown = null;
  await page.route("**/api/decks/deck-1", (route) => {
    if (route.request().method() === "PATCH") {
      patchedBody = route.request().postDataJSON();
      route.fulfill({ json: { deck: deck({ name: "New Name" }), resolvedCards: {}, validation: { status: "draft", issues: [] } } });
      return;
    }
    route.continue();
  });

  await page.goto("/decks");
  // Rename/Duplicate/Delete buttons carry the deck name in their
  // accessible name too (e.g. "Rename Charizard Control"); substring
  // matching on "Rename" alone still resolves to exactly one button here
  // since it's the only action whose name contains that word.
  await page.getByRole("button", { name: "Rename" }).click();
  // Scoped by accessible name: /decks now also renders the card-search
  // box (added below the deck list in the batch-1 UI/UX work), so an
  // unqualified getByRole("textbox") is ambiguous — same "don't leave a
  // locator vague enough to match the wrong thing" lesson as the
  // SwapCardGroup fix elsewhere in this suite, just landing on the test
  // side here since the rename input's accessible name was already
  // distinct and correct.
  const input = page.getByRole("textbox", { name: "Rename Charizard Control" });
  await input.fill("New Name");
  await input.press("Enter");

  await expect.poll(() => patchedBody).toMatchObject({ name: "New Name" });
});

test("deleting a deck removes it immediately and offers undo", async ({ page }) => {
  await page.route("**/api/decks?*", (route) =>
    route.fulfill({ json: { decks: [deck()] } }),
  );
  await page.route("**/api/decks/deck-1", (route) => {
    if (route.request().method() === "DELETE") {
      route.fulfill({ json: { deleted: true } });
      return;
    }
    route.continue();
  });

  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/decks");
  await expect(page.getByRole("link", { name: "Charizard Control", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByRole("link", { name: "Charizard Control", exact: true })).not.toBeVisible();
  await expect(page.getByText('Deleted "Charizard Control"')).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
});

test("undoing a delete restores the deck via the restore endpoint", async ({ page }) => {
  await page.route("**/api/decks?*", (route) =>
    route.fulfill({ json: { decks: [deck()] } }),
  );
  await page.route("**/api/decks/deck-1", (route) => {
    if (route.request().method() === "DELETE") {
      route.fulfill({ json: { deleted: true } });
      return;
    }
    route.continue();
  });

  let restoreCalled = false;
  await page.route("**/api/decks/deck-1/restore", (route) => {
    restoreCalled = true;
    route.fulfill({ json: { restored: true } });
  });

  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/decks");
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Undo" }).click();

  await expect.poll(() => restoreCalled).toBe(true);
});
