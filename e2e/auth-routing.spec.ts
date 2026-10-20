import { expect, test } from "@playwright/test";

import { STORAGE } from "./support/users";

test.describe("signed-in manager", () => {
  test.use({ storageState: STORAGE.manager });

  for (const path of ["/", "/entrar"]) {
    test(`${path} goes to the route board instead of the login card`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/rotas$/);
      await expect(page.getByRole("heading", { name: "Rotas de hoje" })).toBeVisible();
    });
  }

  test("an admin-only page sends a manager to their home, not to the login card", async ({
    page,
  }) => {
    await page.goto("/usuarios");
    await expect(page).toHaveURL(/\/rotas$/);
    await expect(page.getByLabel("Senha")).toHaveCount(0);
  });

  test("an unknown address shows a not-found page inside the app", async ({ page }) => {
    await page.goto("/pagina-que-nao-existe");
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
    await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
    await page.getByRole("link", { name: "Voltar ao início" }).click();
    await expect(page).toHaveURL(/\/rotas$/);
  });
});

test.describe("signed-in field worker", () => {
  test.use({ storageState: STORAGE.fieldWorker });

  test("a manager page sends a field worker to Meus dados", async ({ page }) => {
    await page.goto("/rotas");
    await expect(page).toHaveURL(/\/meus-dados$/);
  });
});

test.describe("signed out", () => {
  test("an unknown address asks to sign in", async ({ page }) => {
    await page.goto("/pagina-que-nao-existe");
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
    await page.getByRole("link", { name: "Voltar ao início" }).click();
    await expect(page).toHaveURL(/\/entrar$/);
  });
});
