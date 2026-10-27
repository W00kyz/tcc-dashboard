import { expect, test as setup } from "@playwright/test";

import { SEED_PASSWORD, SEED_USERS, type SeedRole, STORAGE } from "./support/users";

// One real login per role per run; every spec then starts already signed in.
for (const role of Object.keys(SEED_USERS) as SeedRole[]) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill(SEED_USERS[role]);
    await page.getByLabel("Senha").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).not.toHaveURL(/\/entrar/);
    // A privacy notice newer than the account's last consent gates every page (LGPD, Etapa 11).
    // Accepted here, like the person would; the sweep removes the consent with the run's window,
    // so the next run is asked again.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const consent = page.getByRole("button", { name: "Li e concordo" });
    if (await consent.isVisible()) {
      await consent.click();
      await expect(consent).toHaveCount(0);
    }
    await page.context().storageState({ path: STORAGE[role] });
  });
}
