import { expect, type Page, test } from "@playwright/test";

import { campusToday, SeedApi, uniqueSuffix } from "./support/api";
import { reportedWorkerPosition } from "./support/fieldActivity";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager, viewport: { width: 1440, height: 1600 } });

/** A fresh worker with one route for today; returns the worker's name. The board is filtered
 * to that name, so the row is on screen however many routes today already has. */
async function routeForToday(page: Page, pointCount: number): Promise<string> {
  const api = await SeedApi.signIn("manager");
  const suffix = uniqueSuffix();
  const site = await api.createSite(suffix, pointCount);
  const worker = await api.createFieldWorker(suffix);
  await api.createRoute(
    worker.id,
    campusToday(),
    site.points.map((point) => point.id),
  );
  await api.dispose();
  await page.goto("/rotas");
  await page.getByPlaceholder("Buscar pelo nome").fill(worker.full_name);

  return worker.full_name;
}

function boardRow(page: Page, workerName: string) {
  return page.getByRole("row").filter({ hasText: workerName });
}

async function openMoreActions(page: Page, firstPointName: string) {
  await boardRow(page, firstPointName).getByRole("button", { name: "Mais ações da rota" }).click();
}

test("Otimizar reports its outcome", async ({ page }) => {
  const workerName = await routeForToday(page, 3);
  await openMoreActions(page, workerName);
  await page.getByRole("menuitem", { name: "Otimizar" }).click();

  const dialog = page.getByRole("dialog", { name: "Otimizar rota" });
  // Either outcome is a real answer; silence (the old behaviour) is not.
  await expect(
    dialog.getByText(/Ordem dos pontos otimizada|indisponível|Não foi possível/),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar" }).first().click();
  await expect(dialog).toBeHidden();
});

test("Reatribuir lists only other workers and reassigns the route", async ({ page }) => {
  // Someone to hand the route to, whatever else the database holds.
  const api = await SeedApi.signIn("manager");
  const other = await api.createFieldWorker(`${uniqueSuffix()} substituto`);
  await api.dispose();
  const workerName = await routeForToday(page, 1);
  await boardRow(page, workerName).getByRole("button", { name: "Reatribuir" }).click();

  const dialog = page.getByRole("dialog", { name: "Reatribuir rota" });
  const workerSelect = dialog.getByLabel("Profissional");
  await expect(workerSelect.locator("option", { hasText: workerName })).toHaveCount(0);
  await workerSelect.selectOption({ label: other.full_name });
  await dialog.getByLabel("Motivo da reatribuição").fill("E2E: cobertura de ausência");
  await dialog.getByRole("button", { name: "Confirmar reatribuição" }).click();

  await expect(dialog).toBeHidden();
  // The route left this worker: filtered to their name, the board no longer lists it.
  await expect(boardRow(page, workerName)).toHaveCount(0);
});

test("Concluir ponto sem evidência completes the stop", async ({ page }) => {
  const workerName = await routeForToday(page, 1);
  await openMoreActions(page, workerName);
  await page.getByRole("menuitem", { name: "Concluir ponto sem evidência" }).click();

  const dialog = page.getByRole("dialog", { name: "Concluir ponto sem evidência" });
  await dialog.getByLabel("Motivo da conclusão").fill("E2E: confirmado por telefone");
  await dialog.getByRole("button", { name: "Concluir ponto" }).click();

  await expect(dialog).toBeHidden();
  await expect(boardRow(page, workerName)).toContainText("1/1");
});

test("Cancelar cancels the route", async ({ page }) => {
  const workerName = await routeForToday(page, 1);
  await openMoreActions(page, workerName);
  await page.getByRole("menuitem", { name: "Cancelar" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Motivo do cancelamento").fill("E2E: evento adiado");
  await dialog.getByRole("button", { name: /Cancelar rota|Confirmar/ }).click();

  await expect(dialog).toBeHidden();
  await expect(boardRow(page, workerName)).toContainText("Cancelada");
});

test("the map caption counts workers in Portuguese, singular included", async ({ page }) => {
  await reportedWorkerPosition();
  const api = await SeedApi.signIn("manager");
  const board = await api.get<{ worker_positions: unknown[] }>("/monitoring/board");
  await api.dispose();
  const count = board.worker_positions.length;
  expect(count).toBeGreaterThan(0);

  await page.goto("/rotas");
  await expect(
    page.getByText(
      count === 1 ? "1 profissional com posição" : `${String(count)} profissionais com posição`,
    ),
  ).toBeVisible();
});

test("another day's board says so instead of 'Rotas de hoje · Ao vivo'", async ({ page }) => {
  await page.goto(`/rotas?date=${campusToday(30)}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rotas do dia");
  await expect(page.getByText("Ao vivo", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Indicadores, mapa e alertas abaixo são de hoje/)).toBeVisible();

  await page.getByRole("button", { name: "Voltar para hoje" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rotas de hoje");
});
