import { expect, test } from "@playwright/test";

import { SeedApi } from "./support/api";
import { executionAwaitingReview } from "./support/fieldActivity";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager });

// The queue is never empty here: each run puts its own check-in up for review.
test.beforeAll(async () => {
  await executionAwaitingReview();
});

// The badge and the KPI count every PENDING_REVIEW execution, whatever its date. The list they
// open must show that same set — it used to apply its 7-day default window and hide older ones.
async function pendingReviewTotal(): Promise<number> {
  const api = await SeedApi.signIn("manager");
  const page = await api.get<{ total: number }>("/executions?review_status=PENDING_REVIEW");
  await api.dispose();

  return page.total;
}

test("the board's review KPI opens every execution awaiting review", async ({ page }) => {
  const total = await pendingReviewTotal();
  expect(total).toBeGreaterThan(0);
  await page.goto("/rotas");
  await page.getByRole("link", { name: /Revisão pendente/ }).click();

  await expect(page).toHaveURL(/review_status=PENDING_REVIEW/);
  await expect(page.locator("tbody tr")).toHaveCount(Math.min(total, 50));
});

test("the sidebar review badge opens the same list", async ({ page }) => {
  const total = await pendingReviewTotal();
  expect(total).toBeGreaterThan(0);
  await page.goto("/relatorios");
  await page
    .getByRole("link", { name: /revis/i })
    .filter({ hasText: String(total) })
    .click();

  await expect(page.locator("tbody tr")).toHaveCount(Math.min(total, 50));
});
