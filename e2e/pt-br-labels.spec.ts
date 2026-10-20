import { expect, test } from "@playwright/test";

import { API_URL } from "./support/api";
import { STORAGE } from "./support/users";

test.describe("as admin", () => {
  test.use({ storageState: STORAGE.admin });

  test("Meus dados shows the profile and sign-in events in Portuguese", async ({ page }) => {
    await page.goto("/meus-dados");
    await expect(page.getByText("Administrador", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("Login realizado").first()).toBeVisible();
    await expect(page.getByText("LOGIN_SUCCESS")).toHaveCount(0);
    await expect(page.getByText("ADMIN", { exact: true })).toHaveCount(0);
  });
});

test.describe("as manager", () => {
  test.use({ storageState: STORAGE.manager });

  test("report periods read as pt-BR dates, not ISO codes", async ({ page }) => {
    await page.goto("/relatorios");
    await page.getByLabel("Data inicial").fill("2026-10-01");
    await page.getByLabel("Data final").fill("2026-10-31");
    await page.getByRole("button", { name: "Gerar relatório" }).click();
    const firstPeriod = page.locator("tbody tr").first().locator("td").first();
    await expect(firstPeriod).toHaveText(/^\d{2}\/10\/2026$/);

    await page.getByRole("button", { name: "Semanal" }).click();
    await page.getByRole("button", { name: "Gerar relatório" }).click();
    await expect(page.locator("tbody tr").first().locator("td").first()).toHaveText(
      /^Semana de \d{2}\/\d{2}\/2026$/,
    );
  });

  test("Marcar todas como lidas is off when nothing is unread", async ({ page }) => {
    await page.goto("/notificacoes");
    const unread = await page.evaluate(async (apiUrl) => {
      const session = JSON.parse(localStorage.getItem("route-monitor.session") ?? "{}") as {
        accessToken?: string;
      };
      const response = await fetch(`${apiUrl}/notifications/me/unread-count`, {
        headers: { Authorization: `Bearer ${session.accessToken ?? ""}` },
      });

      return ((await response.json()) as { count: number }).count;
    }, API_URL);
    const button = page.getByRole("button", { name: "Marcar todas como lidas" });
    if (unread === 0) {
      await expect(button).toBeDisabled();
    } else {
      await expect(button).toBeEnabled();
    }
  });
});
