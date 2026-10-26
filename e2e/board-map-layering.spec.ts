import { expect, type Locator, type Page, test } from "@playwright/test";

import { SeedApi } from "./support/api";
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

/** What the topmost element at the centre of `target` belongs to: "modal" inside an open
 * dialog or its backdrop, else its tag and classes (for the failure message). */
async function topmostAt(page: Page, target: Locator): Promise<string> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("topmostAt: target has no bounding box; expected it to be rendered.");
  }
  const { x, y, width, height } = box;

  return page.evaluate(
    ([px, py]) => {
      const hit = document.elementFromPoint(px, py);
      const modal = '[role="dialog"], [data-slot="sheet-overlay"], [data-slot="dialog-overlay"]';

      return hit?.closest(modal) != null
        ? "modal"
        : `${hit?.tagName ?? "nothing"} ${hit?.className ?? ""}`;
    },
    [x + width / 2, y + height / 2] as const,
  );
}

/** Waits for the live snapshot to lay out everything above the map: the KPI strip, and the pool
 * cells when today has typed points. */
async function waitForBoardSnapshot(page: Page) {
  const api = await SeedApi.signIn("manager");
  const board = await api.get<{ pool: unknown[] }>("/monitoring/board");
  await api.dispose();
  await expect(page.getByRole("region", { name: "Indicadores do dia" })).toBeVisible();
  if (board.pool.length > 0) {
    await expect(
      page.getByRole("group", { name: "Pontos de hoje por tipo de serviço" }),
    ).toBeVisible();
  }
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
    await waitForBoardSnapshot(page);
    const header = page.locator("header").first();
    const headerHeight = (await header.boundingBox())?.height ?? 0;
    // Scroll so the zoom control sits right under the middle of the sticky header. Measured
    // again on every try as well: anything else that shifts the layout late (the KPI and pool
    // cells pushed the map down after a single measured scroll in the D5 runs) is absorbed.
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
    // Scrolled to only once the snapshot laid out the cells above the map, or it moves away.
    await waitForBoardSnapshot(page);
    await zoomIn.scrollIntoViewIfNeeded();
    await expect(zoomIn).toBeInViewport();
    await page
      .getByRole("button", { name: "Abrir ou fechar o menu" })
      .filter({ visible: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // A click on the zoom control's spot lands on the sheet (panel or backdrop), not the map.
    // Polled: the sheet animates in.
    await expect.poll(() => topmostAt(page, zoomIn)).toBe("modal");
  });
});
