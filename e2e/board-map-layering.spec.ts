import { expect, type Locator, type Page, test } from "@playwright/test";

import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager });

/** True when the topmost element at the centre of `target` belongs to `owner`. */
async function isCoveredBy(page: Page, target: Locator, owner: Locator): Promise<boolean> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("isCoveredBy: target has no bounding box; expected it to be rendered.");
  }
  const { x, y, width, height } = box;
  const ownerHandle = await owner.elementHandle();

  return page.evaluate(
    ([px, py, ownerElement]) => {
      const hit = document.elementFromPoint(px, py);

      return hit !== null && (ownerElement as Element).contains(hit);
    },
    [x + width / 2, y + height / 2, ownerHandle] as const,
  );
}

// The map needs no route on it: Leaflet's panes are what fight the page's own layers.
test.describe("operations map layering", () => {
  test("the sticky header stays above the map when the page scrolls", async ({ page }) => {
    // Short viewport so the page has room to scroll the map under the header.
    await page.setViewportSize({ width: 1440, height: 520 });
    await page.goto("/rotas");
    // CSS hook, not a role: a modal marks everything behind it aria-hidden.
    const zoomIn = page.locator(".leaflet-control-zoom-in");
    await expect(zoomIn).toBeVisible();
    const header = page.locator("header").first();
    const headerHeight = (await header.boundingBox())?.height ?? 0;
    // Scroll so the zoom control sits right under the middle of the sticky header. Measured
    // again on every try: the KPI and pool cells above the map arrive with the live snapshot
    // and can push it down after a single measured scroll (seen flaky in the D5 runs).
    const goal = headerHeight / 2 + 8;
    await page.mouse.move(900, 300);
    await expect
      .poll(async () => {
        const y = (await zoomIn.boundingBox())?.y ?? 0;
        if (Math.abs(y - goal) > 8) {
          await page.mouse.wheel(0, y - goal);
        }

        return Math.abs(y - goal) <= 8;
      })
      .toBe(true);

    expect(await isCoveredBy(page, zoomIn, header)).toBe(true);
  });

  // The board lost its route dialogs with manual planning; the menu sheet a phone opens over
  // the map is the overlay left to check (Leaflet's panes sit at z-index 400+).
  test("the menu opened over the map on a phone receives the clicks", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/rotas");
    const zoomIn = page.locator(".leaflet-control-zoom-in");
    await zoomIn.scrollIntoViewIfNeeded();
    await expect(zoomIn).toBeVisible();
    await page
      .getByRole("button", { name: "Abrir ou fechar o menu" })
      .filter({ visible: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Whatever of the sheet (panel or backdrop) lies over the zoom control, the map must not.
    const map = page.locator(".leaflet-container");

    expect(await isCoveredBy(page, zoomIn, map)).toBe(false);
  });
});
