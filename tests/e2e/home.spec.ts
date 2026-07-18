import { test, expect } from "@playwright/test";

test("home page loads and shows the app shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "TCG Deck Builder" })).toBeVisible();
  await expect(
    page.getByText("This is an unofficial Pokémon TCG deck-building tool."),
  ).toBeVisible();
});
