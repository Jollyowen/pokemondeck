import { test, expect } from "@playwright/test";

const SAMPLE_SETS = {
  sets: [{ id: "swsh1", name: "Sword & Shield", series: "Sword & Shield", releaseDate: "2020/02/07" }],
};

function sampleCard(overrides: Partial<Record<string, unknown>> = {}) {
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
    abilities: [],
    attacks: [],
    weaknesses: [],
    resistances: [],
    retreatCost: [],
    convertedRetreatCost: 0,
    rules: [],
    legalities: { standard: "legal", expanded: "legal", unlimited: "legal" },
    ...overrides,
  };
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/sets", (route) =>
    route.fulfill({ json: SAMPLE_SETS }),
  );
});

test("searching shows matching cards", async ({ page }) => {
  await page.route("**/api/cards?*", (route) =>
    route.fulfill({
      json: { cards: [sampleCard()], page: 1, pageSize: 24, totalCount: 1 },
    }),
  );

  await page.goto("/cards");
  await expect(page.getByText("Charizard")).toBeVisible();
});

test("illegal-in-format cards are shown greyed out with a label, not removed", async ({ page }) => {
  await page.route("**/api/cards?*", (route) =>
    route.fulfill({
      json: {
        cards: [sampleCard({ legalities: { standard: "not_legal", expanded: "legal", unlimited: "legal" } })],
        page: 1,
        pageSize: 24,
        totalCount: 1,
      },
    }),
  );

  await page.goto("/cards");
  // Select the Standard format toggle.
  await page.getByRole("button", { name: "Standard" }).click();

  await expect(page.getByText("Charizard")).toBeVisible();
  await expect(page.getByText("Not legal in Standard")).toBeVisible();
});

test("shows an empty state when no cards match", async ({ page }) => {
  await page.route("**/api/cards?*", (route) =>
    route.fulfill({ json: { cards: [], page: 1, pageSize: 24, totalCount: 0 } }),
  );

  await page.goto("/cards");
  await expect(page.getByText("No cards found")).toBeVisible();
});

test("shows an error state when the catalogue is unavailable", async ({ page }) => {
  await page.route("**/api/cards?*", (route) =>
    route.fulfill({
      status: 502,
      json: {
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "The card catalogue is temporarily unavailable and no matching cached results were found. Please try again shortly.",
        },
      },
    }),
  );

  await page.goto("/cards");
  await expect(page.getByText("Couldn't load cards")).toBeVisible();
});

test("pagination requests the next page", async ({ page }) => {
  let requestedPage: string | null = null;
  await page.route("**/api/cards?*", (route) => {
    const url = new URL(route.request().url());
    requestedPage = url.searchParams.get("page");
    route.fulfill({
      json: {
        cards: [sampleCard()],
        page: Number(requestedPage ?? "1"),
        pageSize: 24,
        totalCount: 48,
      },
    });
  });

  await page.goto("/cards");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  expect(requestedPage).toBe("2");
});
