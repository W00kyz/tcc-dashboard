import { expect, type Page, test } from "@playwright/test";

import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.admin, viewport: { width: 1920, height: 1080 } });

// The page column's padding (Page: px-8 from md up).
const GUTTER_PX = 32;

/** Space left between the page column and the right edge of the window. */
async function emptyBandOnTheRight(page: Page): Promise<number> {
  const column = page
    .locator("h1")
    .first()
    .locator("xpath=ancestor::div[contains(@class,'flex-col')][1]");
  const box = await column.boundingBox();
  if (box === null) {
    throw new Error("emptyBandOnTheRight: the page column has no box; expected it to render.");
  }

  return 1920 - (box.x + box.width);
}

// Regression: pages were capped at 5xl/7xl and left a wide empty band on the right.
for (const path of ["/rotas", "/predios", "/profissionais", "/execucoes", "/usuarios"]) {
  test(`${path} uses the whole width of the window`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();

    expect(await emptyBandOnTheRight(page)).toBeLessThanOrEqual(GUTTER_PX);
  });
}
