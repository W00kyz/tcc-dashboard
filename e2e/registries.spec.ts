import { expect, type Page, test } from "@playwright/test";

import { SeedApi, uniqueSuffix } from "./support/api";
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

  test("creates and edits a company", async ({ page }) => {
    const suffix = uniqueSuffix();
    await openNew(page, "/empresas-terceirizadas", "Nova empresa");
    await page.getByLabel("Nome").fill(`E2E Empresa ${suffix}`);
    await page.getByLabel("CNPJ").fill(String(Date.now()).slice(-14).padStart(14, "9"));
    await page.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByText(`E2E Empresa ${suffix}`, { exact: true })).toBeVisible();

    await editFirstField(page, `E2E Empresa ${suffix}`, "Nome", `E2E Empresa ${suffix} editada`);
  });
});

const EMPTY_SUBMIT_CASES = [
  { page: "/profissionais", newLabel: "Novo profissional", api: "/field-workers" },
  { page: "/tipos-de-servico", newLabel: "Novo tipo de serviço", api: "/service-types" },
  { page: "/usuarios", newLabel: "Novo usuário", api: "/users" },
];

for (const { page: path, newLabel, api } of EMPTY_SUBMIT_CASES) {
  test(`${path} blocks an empty submit`, async ({ page }) => {
    await expectEmptySubmitBlocked(page, path, newLabel, api);
  });
}

test("Eventos was removed: no menu entry, no page, no event fields on points", async ({ page }) => {
  const api = await SeedApi.signIn("admin");
  const site = await api.createSite(uniqueSuffix(), 0);
  await api.dispose();

  await page.goto(`/predios?predio=${site.building.id}`);
  await page.getByRole("button", { name: "Novo ponto" }).click();
  const points = page.getByRole("dialog", { name: "Novo ponto de serviço" });
  await expect(points.getByLabel("Andar", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Eventos", exact: true })).toHaveCount(0);
  await expect(points.getByLabel("Tipo")).toHaveCount(0);
  await expect(points.getByLabel("Evento")).toHaveCount(0);
  await expect(page.getByLabel("Mostrar arquivados")).toHaveCount(0);

  await page.goto("/eventos");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});

test("Tipos de serviço: rejects a zero duration, then creates and edits", async ({ page }) => {
  const name = `E2E Tipo ${uniqueSuffix()}`;
  await openNew(page, "/tipos-de-servico", "Novo tipo de serviço");
  await page.getByLabel("Nome").fill(name);
  await page.getByLabel("Duração média (minutos)").fill("0");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("alert")).toContainText("maior que zero");

  await page.getByLabel("Duração média (minutos)").fill("45");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await editFirstField(page, name, "Nome", `${name} editado`);
});

test("Profissionais: picks service types by checkbox and edits", async ({ page }) => {
  const name = `E2E Profissional ${uniqueSuffix()}`;
  await openNew(page, "/profissionais", "Novo profissional");
  await page.getByLabel("Nome completo").fill(name);
  await page
    .getByLabel("Empresa terceirizada")
    .selectOption({ label: "Limpa Tudo Terceirizados Ltda" });
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("alert")).toContainText("Tipos de serviço");

  await page.getByRole("checkbox", { name: "Limpeza" }).check();
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await editFirstField(page, name, "Nome completo", `${name} editado`);
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
