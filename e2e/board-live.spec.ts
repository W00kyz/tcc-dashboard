import { expect, type Page, test } from "@playwright/test";

import { SeedApi } from "./support/api";
import { reportedPosition, startedRouteOnNewSite } from "./support/fieldActivity";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager, viewport: { width: 1440, height: 1600 } });

/** The campus calendar date `offsetDays` from today, as the board's `?date=` reads it. */
function campusDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "America/Fortaleza",
  });
}

async function boardPositionCount(): Promise<number> {
  const api = await SeedApi.signIn("manager");
  const board = await api.get<{ worker_positions: unknown[] }>("/monitoring/board");
  await api.dispose();

  return board.worker_positions.length;
}

/** The map caption, after a reload so the live snapshot is the one just read from the API. */
async function expectMapCaption(page: Page, caption: string) {
  await page.goto("/rotas");
  await expect(
    page.getByRole("region", { name: "Mapa da operação" }).getByText(caption, { exact: true }),
  ).toBeVisible();
}

test("the map caption counts workers in Portuguese, singular included", async ({ page }) => {
  // Only workers with a route today count, and no other spec sends a position: the run starts
  // with none, so the first fix reads in the singular.
  const before = await boardPositionCount();
  expect(before, "another worker on the dev stack is sending positions today").toBe(0);

  await reportedPosition(await startedRouteOnNewSite());
  await expectMapCaption(page, "1 profissional com posição");

  await reportedPosition(await startedRouteOnNewSite());
  await expectMapCaption(page, "2 profissionais com posição");
});

test("another day's board says so instead of 'Rotas de hoje · Ao vivo'", async ({ page }) => {
  await page.goto(`/rotas?date=${campusDate(30)}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rotas do dia");
  await expect(page.getByText(/Ao vivo|Conexão instável/)).toHaveCount(0);
  await expect(page.getByText(/Indicadores, mapa e alertas abaixo são de hoje/)).toBeVisible();

  await page.getByRole("button", { name: "Voltar para hoje" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rotas de hoje");
  // Live again: streaming, or polling when the stream drops.
  await expect(page.getByText(/Ao vivo|Conexão instável/)).toBeVisible();
});
