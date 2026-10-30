import { expect, type Page, test } from "@playwright/test";

import { registerWorker, SeedApi, uniqueSuffix } from "./support/api";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.admin });

// Every create and edit form opens in a Dialog (spec 2026-10-20 §2): there is no side panel.
const dialog = (page: Page) => page.getByRole("dialog");

/** Opens the page's "Novo …" dialog. */
async function openNew(page: Page, path: string, newLabel: string) {
  await page.goto(path);
  await page.getByRole("button", { name: newLabel }).click();
  await expect(dialog(page).getByRole("heading", { name: "Novo cadastro" })).toBeVisible();
}

/** Submits the "Novo …" dialog empty and checks nothing was sent and the user was told why. */
async function expectEmptySubmitBlocked(
  page: Page,
  path: string,
  newLabel: string,
  apiPath: string,
) {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === apiPath) {
      posts.push(request.url());
    }
  });
  await openNew(page, path, newLabel);
  await dialog(page).getByRole("button", { name: "Cadastrar" }).click();

  await expect(dialog(page).getByRole("alert")).toContainText("Preencha os campos obrigatórios");
  expect(posts).toEqual([]);
}

/** A failed save must say so (and keep the dialog open) instead of silently doing nothing. */
async function expectSaveFailureShown(page: Page, apiPath: string, fill: () => Promise<void>) {
  await page.route(`**${apiPath}`, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 500, body: "{}" })
      : route.fallback(),
  );
  await fill();
  await dialog(page).getByRole("button", { name: "Cadastrar" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Não foi possível salvar");
  await page.unroute(`**${apiPath}`);
}

/** Opens a row's "Editar" dialog, changes the first field, saves, and expects the new value
 * listed with the dialog closed. */
async function editFirstField(page: Page, rowName: string, fieldLabel: string, next: string) {
  await page.getByRole("button", { name: `Editar ${rowName}` }).click();
  await expect(dialog(page).getByRole("heading", { name: "Editar cadastro" })).toBeVisible();
  await dialog(page).getByLabel(fieldLabel, { exact: true }).fill(next);
  await dialog(page).getByRole("button", { name: "Salvar alterações" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByText(next, { exact: true })).toBeVisible();
}

test.describe("Empresas", () => {
  test("blocks an empty submit", async ({ page }) => {
    await expectEmptySubmitBlocked(
      page,
      "/empresas-terceirizadas",
      "Nova empresa",
      "/contractor-companies",
    );
  });

  test("shows a failed save", async ({ page }) => {
    await openNew(page, "/empresas-terceirizadas", "Nova empresa");
    await expectSaveFailureShown(page, "/contractor-companies", async () => {
      await page.getByLabel("Nome").fill("Empresa que falha");
      await page.getByLabel("CNPJ").fill("00000000000000");
    });
  });

  test("creates a company with its service types, then edits it", async ({ page }) => {
    const suffix = uniqueSuffix();
    await openNew(page, "/empresas-terceirizadas", "Nova empresa");
    await page.getByLabel("Nome", { exact: true }).fill(`E2E Empresa ${suffix}`);
    await page.getByLabel("CNPJ").fill(String(Date.now()).slice(-14).padStart(14, "9"));
    await dialog(page).getByRole("button", { name: "Adicionar tipo" }).click();
    await dialog(page).getByLabel("Nome do tipo 1").fill(`E2E Tipo ${suffix}`);
    await dialog(page).getByLabel("Duração média do tipo 1 (min)").fill("40");
    await page.getByRole("button", { name: "Cadastrar" }).click();
    const row = page.getByRole("listitem").filter({ hasText: `E2E Empresa ${suffix}` });
    await expect(row.getByText(`E2E Tipo ${suffix}`)).toBeVisible();

    await editFirstField(page, `E2E Empresa ${suffix}`, "Nome", `E2E Empresa ${suffix} editada`);
  });

  test("a service type line needs a name before the company is saved", async ({ page }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/contractor-companies"
      ) {
        posts.push(request.url());
      }
    });
    await openNew(page, "/empresas-terceirizadas", "Nova empresa");
    await page.getByLabel("Nome", { exact: true }).fill(`E2E Empresa ${uniqueSuffix()}`);
    await page.getByLabel("CNPJ").fill(String(Date.now()).slice(-14).padStart(14, "8"));
    await dialog(page).getByRole("button", { name: "Adicionar tipo" }).click();
    await dialog(page).getByLabel("Duração média do tipo 1 (min)").fill("30");
    await dialog(page).getByRole("button", { name: "Cadastrar" }).click();

    await expect(dialog(page).getByRole("alert")).toContainText(
      "Todo tipo de serviço precisa de nome",
    );
    await expect(dialog(page).getByLabel("Nome do tipo 1")).toHaveAttribute("aria-invalid", "true");
    expect(posts).toEqual([]);
  });

  test("a type still used by a point cannot be removed, and the dialog says by how many", async ({
    page,
  }) => {
    const api = await SeedApi.signIn("admin");
    const site = await api.createSite(uniqueSuffix(), 1);
    await api.dispose();
    const company = site.company?.name ?? "";
    const serviceType = site.company?.serviceType.name ?? "";

    await page.goto("/empresas-terceirizadas");
    await page.getByRole("button", { name: `Editar ${company}` }).click();
    await dialog(page)
      .getByRole("button", { name: `Remover tipo ${serviceType}` })
      .click();
    await dialog(page).getByRole("button", { name: "Salvar alterações" }).click();

    await expect(dialog(page).getByRole("alert")).toContainText(
      `O tipo “${serviceType}” é usado por 1 ponto e não pode ser removido.`,
    );
    await dialog(page).getByRole("button", { name: "Cancelar" }).click();
    const row = page.getByRole("listitem").filter({ hasText: company });
    await expect(row.getByText(serviceType)).toBeVisible();
  });
});

test("the old Tipos de serviço page lands on Empresas", async ({ page }) => {
  await page.goto("/tipos-de-servico");
  await expect(page).toHaveURL(/\/empresas-terceirizadas$/);
  await expect(page.getByRole("link", { name: "Tipos de serviço", exact: true })).toHaveCount(0);
});

test("/usuarios blocks an empty submit", async ({ page }) => {
  await expectEmptySubmitBlocked(page, "/usuarios", "Novo usuário", "/users");
});

test("Eventos was removed: no menu entry, no page, no event fields on rooms", async ({ page }) => {
  const api = await SeedApi.signIn("admin");
  const site = await api.createSite(uniqueSuffix(), 0);
  await api.dispose();

  await page.goto(`/predios?predio=${site.building.id}`);
  // Checked before the dialog opens: behind a modal the page is aria-hidden and these would pass blindly.
  await expect(page.getByRole("link", { name: "Eventos", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Mostrar arquivados")).toHaveCount(0);
  // Points are made through rooms now, in the building's dialog: a name and Limpeza, nothing more.
  await page
    .locator(".leaflet-popup")
    .getByRole("button", { name: `Editar ${site.building.name}` })
    .click();
  await page.getByRole("button", { name: "Nova sala" }).click();
  const points = page.getByRole("dialog", { name: "Nova sala" });
  await expect(points.getByLabel("Nome da sala (opcional)")).toBeVisible();
  await expect(points.getByLabel("Tipo", { exact: true })).toHaveCount(0);
  await expect(points.getByLabel("Evento")).toHaveCount(0);

  await page.goto("/eventos");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});

test.describe("Profissionais", () => {
  /** A worker who signed up in the app for a new E2E company, waiting for approval. */
  async function pendingWorker(suffix: string) {
    const api = await SeedApi.signIn("admin");
    const company = await api.createCompany(suffix);
    await api.dispose();

    return { company, worker: await registerWorker(suffix, company.id) };
  }

  const workerRow = (page: Page, name: string) =>
    page.getByRole("listitem").filter({ hasText: name });

  test("the manager does not register workers: there is no Novo profissional", async ({ page }) => {
    await page.goto("/profissionais");
    await expect(page.getByRole("heading", { name: "Profissionais de Campo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo profissional" })).toHaveCount(0);
  });

  test("approves a self-registered worker into their company's group", async ({ page }) => {
    const { company, worker } = await pendingWorker(uniqueSuffix());
    await page.goto("/profissionais");
    await expect(page.getByRole("heading", { name: "Aguardando aprovação" })).toBeVisible();
    const pending = workerRow(page, worker.fullName);
    await expect(pending).toContainText(worker.email);
    await expect(pending).toContainText(company.name);

    await pending.getByRole("button", { name: `Aprovar ${worker.fullName}` }).click();

    await expect(page.getByRole("heading", { name: company.name })).toBeVisible();
    const approved = workerRow(page, worker.fullName);
    await expect(approved).toContainText("Ativo");
    await expect(approved).toContainText("Feitos hoje: 0");
    await expect(
      approved.getByRole("button", { name: `Desativar ${worker.fullName}` }),
    ).toBeVisible();
  });

  test("rejects a self-registered worker with a reason", async ({ page }) => {
    const { worker } = await pendingWorker(uniqueSuffix());
    await page.goto("/profissionais");
    await workerRow(page, worker.fullName)
      .getByRole("button", { name: `Reprovar ${worker.fullName}` })
      .click();
    const reject = page.getByRole("dialog", { name: "Reprovar cadastro" });
    await reject.getByLabel("Motivo (opcional)").fill("E2E: empresa errada");
    await reject.getByRole("button", { name: "Reprovar" }).click();
    await expect(reject).toHaveCount(0);

    await page.getByRole("button", { name: /^Reprovados \(\d+\)$/ }).click();
    const rejected = workerRow(page, worker.fullName);
    await expect(rejected).toContainText("Motivo: E2E: empresa errada");
    await expect(
      rejected.getByRole("button", { name: `Aprovar ${worker.fullName}` }),
    ).toBeVisible();
  });
});

test("Usuários: the admin cannot deactivate their own account", async ({ page }) => {
  await page.goto("/usuarios");
  const ownRow = page.getByRole("listitem").filter({ hasText: "admin@pu.ufcg.edu.br" });
  await expect(ownRow.getByText("Você")).toBeVisible();
  await expect(ownRow.getByRole("button", { name: "Desativar" })).toHaveCount(0);
});

test("Usuários: creates and edits a user", async ({ page }) => {
  const suffix = uniqueSuffix();
  await openNew(page, "/usuarios", "Novo usuário");
  await page.getByLabel("Nome").fill(`E2E Usuário ${suffix}`);
  await page.getByLabel("E-mail").fill(`e2e-${suffix}@empresa.com`);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText(`E2E Usuário ${suffix}`, { exact: true })).toBeVisible();
  await editFirstField(page, `E2E Usuário ${suffix}`, "Nome", `E2E Usuário ${suffix} editado`);
});
