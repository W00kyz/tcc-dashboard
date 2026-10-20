import { expect, type Locator, type Page, test } from "@playwright/test";

import { campusToday, SeedApi, uniqueSuffix } from "./support/api";
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

test.describe("operations map layering", () => {
  test.beforeAll(async () => {
    const api = await SeedApi.signIn("manager");
    const suffix = uniqueSuffix();
    const site = await api.createSite(suffix);
    const worker = await api.fieldWorkerNamed("João da Silva");
    await api.createRoute(worker.id, campusToday(), [site.points[0]?.id ?? ""]);
    await api.dispose();
  });

  test("the sticky header stays above the map when the page scrolls", async ({ page }) => {
    // Short viewport so the page has room to scroll the map under the header.
    await page.setViewportSize({ width: 1440, height: 520 });
    await page.goto("/rotas");
    // CSS hook, not a role: a modal marks everything behind it aria-hidden.
    const zoomIn = page.locator(".leaflet-control-zoom-in");
    await expect(zoomIn).toBeVisible();
    const header = page.locator("header").first();
    const headerBox = await header.boundingBox();
    const zoomBox = await zoomIn.boundingBox();
    // Scroll so the zoom control sits right under the middle of the sticky header.
    await page.mouse.move(900, 300);
    await page.mouse.wheel(0, (zoomBox?.y ?? 0) - (headerBox?.height ?? 0) / 2 - 8);
    await expect.poll(async () => (await zoomIn.boundingBox())?.y ?? 0).toBeLessThan(56);

    expect(await isCoveredBy(page, zoomIn, header)).toBe(true);
  });

  test("a board dialog opened over the map receives the clicks", async ({ page }) => {
    // Tall enough that the map and the route rows are on screen together (no scroll).
    await page.setViewportSize({ width: 1440, height: 1600 });
    await page.goto("/rotas");
    const zoomIn = page.locator(".leaflet-control-zoom-in");
    await expect(zoomIn).toBeVisible();
    await page.getByRole("button", { name: "Reatribuir" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const overlay = page.locator('[data-slot="dialog-overlay"]');

    expect(await isCoveredBy(page, zoomIn, overlay)).toBe(true);
  });
});
