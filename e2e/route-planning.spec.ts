import { expect, type Page, test } from "@playwright/test";

import { campusToday, SeedApi, uniqueSuffix } from "./support/api";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager });

let site: Awaited<ReturnType<SeedApi["createSite"]>>;

test.beforeAll(async () => {
  const api = await SeedApi.signIn("manager");
  site = await api.createSite(uniqueSuffix());
  await api.dispose();
});

function countPosts(page: Page, apiPath: string): string[] {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === apiPath) {
      posts.push(request.url());
    }
  });

  return posts;
}

async function addSitePoint(page: Page, prefix: "route" | "template") {
  await page.locator(`#${prefix}-building`).selectOption({ label: site.building.name });
  await page.locator(`#${prefix}-floor`).selectOption({ label: site.floor.label });
  await page
    .getByRole("combobox", { name: "Adicionar ponto" })
    .selectOption({ label: site.points[0]?.name ?? "" });
  await page.getByRole("button", { name: "Adicionar ponto" }).click();
}

test.describe("Nova rota", () => {
  test("says what is missing instead of posting an empty route", async ({ page }) => {
    const posts = countPosts(page, "/routes");
    await page.goto("/rotas/nova");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByRole("alert")).toContainText("Profissional, Pontos da rota");
    expect(posts).toEqual([]);
  });
});

test.describe("Rota em Dialog", () => {
  test("a route is created in a dialog over the board and shown on its day", async ({ page }) => {
    const api = await SeedApi.signIn("manager");
    const worker = await api.createFieldWorker(uniqueSuffix());
    await api.dispose();
    await page.goto("/rotas");
    await page.getByRole("button", { name: "Nova rota", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nova rota" });

    await dialog.getByLabel("Profissional").selectOption({ label: worker.full_name });
    await dialog.getByLabel("Data").fill(campusToday(2));
    await addSitePoint(page, "route");
    await dialog.getByRole("button", { name: "Salvar" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`date=${campusToday(2)}`));
    await page.getByPlaceholder("Buscar pelo nome").fill(worker.full_name);
    await expect(page.getByRole("row").filter({ hasText: worker.full_name })).toHaveCount(1);
  });

  test("Editar opens the route in the dialog, and the old address does too", async ({ page }) => {
    const api = await SeedApi.signIn("manager");
    const worker = await api.createFieldWorker(uniqueSuffix());
    const route = await api.createRoute(worker.id, campusToday(), [site.points[0]?.id ?? ""]);
    await api.dispose();

    await page.goto(`/rotas?q=${encodeURIComponent(worker.full_name)}`);
    await page
      .getByRole("row")
      .filter({ hasText: worker.full_name })
      .getByRole("link", { name: "Editar" })
      .click();
    const dialog = page.getByRole("dialog", { name: "Editar rota" });
    await expect(dialog.getByText(site.points[0]?.name ?? "")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toHaveCount(0);

    await page.goto(`/rotas/${route.id}/editar`);
    await expect(page.getByRole("dialog", { name: "Editar rota" })).toBeVisible();
  });
});

test.describe("Templates de rota", () => {
  test("blocks a template with no name and no points", async ({ page }) => {
    const posts = countPosts(page, "/route-templates");
    await page.goto("/templates-de-rota");
    await page.getByRole("button", { name: "Novo template" }).click();
    await page.getByRole("button", { name: "Salvar template" }).click();

    await expect(page.getByRole("alert")).toContainText("Nome, Pontos da rota");
    expect(posts).toEqual([]);
  });

  test("a template with a default worker materialises without picking one", async ({ page }) => {
    const name = `E2E Template ${uniqueSuffix()}`;
    await page.goto("/templates-de-rota");
    await page.getByRole("button", { name: "Novo template" }).click();
    await page.getByLabel("Nome", { exact: true }).fill(name);
    await page.getByLabel("Profissional padrão").selectOption({ label: "João da Silva" });
    await addSitePoint(page, "template");
    await page.getByRole("button", { name: "Salvar template" }).click();

    const row = page.getByRole("listitem").filter({ hasText: name });
    await row.getByRole("button", { name: "Materializar" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("combobox")).toHaveValue("");
    await expect(dialog.getByText("Manter João da Silva")).toBeAttached();
    await dialog.getByLabel("Data da rota").fill(campusToday(30));
    await dialog.getByRole("button", { name: "Materializar rota" }).click();

    await expect(page).toHaveURL(new RegExp(`/rotas\\?date=${campusToday(30)}`));
  });

  test("without a default worker, materialising requires one", async ({ page }) => {
    const name = `E2E Template sem padrão ${uniqueSuffix()}`;
    await page.goto("/templates-de-rota");
    await page.getByRole("button", { name: "Novo template" }).click();
    await page.getByLabel("Nome", { exact: true }).fill(name);
    await addSitePoint(page, "template");
    await page.getByRole("button", { name: "Salvar template" }).click();

    const row = page.getByRole("listitem").filter({ hasText: name });
    await row.getByRole("button", { name: "Materializar" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("não tem profissional padrão")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Materializar rota" })).toBeDisabled();
    await dialog.getByLabel("Profissional").selectOption({ label: "João da Silva" });
    await expect(dialog.getByRole("button", { name: "Materializar rota" })).toBeEnabled();
  });
});
