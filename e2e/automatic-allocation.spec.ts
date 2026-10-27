import { randomUUID } from "node:crypto";

import { expect, type Page, test } from "@playwright/test";

import { registerWorker, SeedApi, uniqueSuffix } from "./support/api";
import { releaseForSilence, SITE_SPOT, startRoute } from "./support/fieldActivity";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager, viewport: { width: 1440, height: 1600 } });

interface AllocatedStop {
  id: string;
  service_point_name: string;
  status: string;
}

/** The pool KPI cell of the spec's own service type: "feitos / total", then "N em andamento ·
 * N livres". */
function poolCell(page: Page, serviceType: string, company: string) {
  return page
    .getByRole("group", { name: "Pontos de hoje por tipo de serviço" })
    .getByRole("group", { name: `${serviceType} · ${company}` });
}

async function expectPool(page: Page, cell: ReturnType<typeof poolCell>, pool: string) {
  // The board is live (stream, else polling): reload so the check never waits on a tick.
  await page.goto("/rotas");
  await expect(cell).toContainText(pool);
}

// Spec 2026-10-20-alocacao-automatica §11: the manager approves a sign-up, the worker (through
// the app's API) starts a route and is handed a batch, reports an impediment, goes silent and
// loses the rest of the batch, appeals, and the manager accepts the appeal. The manager never
// plans anything; everything they do here is approve, watch and decide.
test("a worker's automatic day, from sign-up to an accepted appeal", async ({ page }) => {
  const suffix = uniqueSuffix();
  const manager = await SeedApi.signIn("manager");
  // Two points of a type only this spec's company serves: the worker's pool is exactly them.
  const site = await manager.createSite(suffix, 2);
  const company = site.company?.name ?? "";
  const serviceType = site.company?.serviceType.name ?? "";
  const worker = await registerWorker(suffix, site.company?.id ?? "");
  const pool = poolCell(page, serviceType, company);
  const [first, second] = site.points.map((point) => point.name);

  await test.step("the manager approves the sign-up", async () => {
    await page.goto("/profissionais");
    const row = page.getByRole("listitem").filter({ hasText: worker.fullName });
    await row.getByRole("button", { name: `Aprovar ${worker.fullName}` }).click();
    await expect(row.getByRole("button", { name: `Desativar ${worker.fullName}` })).toBeVisible();
  });

  await test.step("before the start, the board expects the worker and the pool is free", async () => {
    await expectPool(page, pool, "0 / 2");
    await expect(pool).toContainText("0 em andamento · 2 livres");
    const notStarted = page.getByRole("region", { name: "Ainda não iniciaram hoje" });
    await expect(notStarted.getByText(worker.fullName, { exact: true })).toBeVisible();
  });

  const routeId = await startRoute(worker);
  const app = await SeedApi.signInAs(worker.email, worker.password);
  const myDay = await app.get<{ route: { stops: AllocatedStop[] } }>("/routes/me");
  const stops = myDay.route.stops;
  const stopOf = (name: string | undefined): AllocatedStop => {
    const stop = stops.find((candidate) => candidate.service_point_name === name);
    if (stop === undefined) {
      throw new Error(`no allocated stop for point "${String(name)}"; expected it in the batch.`);
    }

    return stop;
  };

  await test.step("the start hands the worker a batch, and the board shows it", async () => {
    expect(stops.map((stop) => stop.service_point_name).sort()).toEqual([first, second].sort());
    await expectPool(page, pool, "0 / 2");
    await expect(pool).toContainText("2 em andamento · 0 livres");
    const row = page.getByRole("row").filter({ hasText: worker.fullName });
    await expect(row).toContainText("Lote 1");
    await expect(row).toContainText(company);
    await expect(
      page
        .getByRole("region", { name: "Ainda não iniciaram hoje" })
        .getByText(worker.fullName, { exact: true }),
    ).toHaveCount(0);
  });

  await test.step("an impediment on one point gives it back to the pool at once", async () => {
    await app.post(`/routes/${routeId}/impediments`, {
      route_stop_id: stopOf(first).id,
      scope: "STOP",
      reason: "ACCESS_BLOCKED",
      note: "E2E: sala trancada",
      reported_at: new Date().toISOString(),
    });

    await expectPool(page, pool, "1 em andamento · 1 livre");
    await expect(
      page.getByText(`${worker.fullName} não pode executar o ponto ${first ?? ""}`),
    ).toBeVisible();

    await page.goto("/justificativas");
    const impediment = page.getByRole("row").filter({ hasText: worker.fullName });
    await expect(impediment).toContainText(first ?? "");
    await expect(impediment).toContainText("Acesso bloqueado");
    await expect(impediment).toContainText("E2E: sala trancada");
    const acknowledge = impediment.getByRole("button", {
      name: `Ciente do impedimento de ${worker.fullName}`,
    });
    await expect(impediment).toContainText("Pendente");
    await acknowledge.click();
    // The button and the resolved badge both read "Ciente": what changes is that the button
    // and the "Pendente" badge are gone.
    await expect(acknowledge).toHaveCount(0);
    await expect(impediment).not.toContainText("Pendente");
  });

  await test.step("silent past the limit, the rest of the batch is released too", async () => {
    releaseForSilence(routeId);

    await expectPool(page, pool, "0 em andamento · 2 livres");
    await expect(page.getByText(`Lote de ${worker.fullName} liberado`)).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: worker.fullName });
    await expect(row).toContainText("Pausada");
  });

  await test.step("the worker appeals the released point and the manager accepts", async () => {
    const eligible = await app.get<{ route_stop_id: string }[]>("/appeals/eligible");
    // The silence release is appealable; the worker's own impediment is not.
    expect(eligible.map((stop) => stop.route_stop_id)).toEqual([stopOf(second).id]);
    await app.post("/appeals", {
      route_stop_id: stopOf(second).id,
      reason: "NO_SIGNAL",
      note: "E2E: fiquei sem sinal no subsolo, mas limpei a sala",
      claimed_executed_at: new Date().toISOString(),
      idempotency_key: randomUUID(),
    });

    await page.goto("/justificativas");
    await page.getByRole("tab", { name: /^Recursos/ }).click();
    const appeal = page.getByRole("row").filter({ hasText: worker.fullName });
    await expect(appeal).toContainText(second ?? "");
    await expect(appeal).toContainText("Sem localização");
    await expect(appeal).toContainText("Fiquei sem sinal");
    await appeal.getByRole("button", { name: `Aceitar o recurso de ${worker.fullName}` }).click();
    const accept = page.getByRole("dialog", { name: "Aceitar recurso" });
    await accept.getByLabel("Observação").fill("E2E: conferido com o encarregado");
    await accept.getByRole("button", { name: "Aceitar" }).click();
    await expect(accept).toHaveCount(0);
    await expect(appeal).toContainText("Aceito por Larissa Almeida");
  });

  await test.step("the accepted appeal is an execution 'Por recurso' and the point is done", async () => {
    const { id: workerId } = await manager.fieldWorkerNamed(worker.fullName);
    await page.goto(`/execucoes?date_from=&field_worker_id=${workerId}&source=APPEAL`);
    const execution = page.locator("tbody tr").filter({ hasText: second ?? "" });
    await expect(execution).toHaveCount(1);
    await expect(execution).toContainText("Por recurso");
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await expectPool(page, pool, "1 / 2");
  });

  await app.dispose();
  await manager.dispose();
});

test("the worker's start position must be inside the campus", async () => {
  const suffix = uniqueSuffix();
  const manager = await SeedApi.signIn("manager");
  const site = await manager.createSite(suffix, 1);
  const worker = await registerWorker(suffix, site.company?.id ?? "");
  await manager.approveWorker(worker.fullName);
  await manager.dispose();

  const app = await SeedApi.signInAs(worker.email, worker.password);
  const refused = await app.postRaw("/routes/start", {
    // A kilometre south of the campus rectangle.
    latitude: SITE_SPOT.latitude - 0.02,
    longitude: SITE_SPOT.longitude,
    captured_at: new Date().toISOString(),
  });
  await app.dispose();

  expect(refused.status).toBe(409);
  expect(refused.body).toMatchObject({ detail: { code: "OUTSIDE_CAMPUS" } });
});
