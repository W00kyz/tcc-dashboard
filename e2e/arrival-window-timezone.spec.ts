import { expect, test } from "@playwright/test";

import { campusClockIn, campusToday, SeedApi, uniqueSuffix } from "./support/api";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager });

// Regression (backend app/core/campus_clock.py): arrival windows are campus wall-clock tagged
// UTC — "10:00" is stored as 10:00Z. The board compared them with the real UTC instant, three
// hours ahead of Campina Grande, so a window an hour away already showed as "Atrasada".
test("a stop whose window ends in an hour is not shown as late", async ({ page }) => {
  const windowEnd = campusClockIn(60);
  // Past 23:00 the window would fall on tomorrow's date; nothing to assert then.
  test.skip(windowEnd < campusClockIn(0), "too close to midnight on campus");

  const api = await SeedApi.signIn("manager");
  const suffix = uniqueSuffix();
  const site = await api.createSite(suffix);
  const worker = await api.createFieldWorker(suffix);
  await api.createRoute(
    worker.id,
    campusToday(),
    site.points.map((point) => point.id),
    `${campusToday()}T${windowEnd}:00Z`,
  );
  await api.dispose();

  await page.goto("/rotas");
  await page.getByPlaceholder("Buscar pelo nome").fill(worker.full_name);
  const row = page.getByRole("row").filter({ hasText: worker.full_name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Planejada");
  await expect(row).not.toContainText("Atrasada");
});
