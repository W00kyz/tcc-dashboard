import { expect, test } from "@playwright/test";

import { SeedApi, uniqueSuffix } from "./support/api";
import { finishedExecutionWithEvidence } from "./support/fieldActivity";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager });

test("the manager marks a company's service type as requiring evidence, and it stays marked", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const manager = await SeedApi.signIn("manager");
  const company = await manager.createCompany(suffix);
  await manager.dispose();

  await page.goto("/empresas-terceirizadas");
  await page.getByRole("button", { name: `Editar ${company.name}` }).click();
  const dialog = page.getByRole("dialog");
  const requiresEvidence = dialog.getByRole("checkbox", { name: "Exige evidências" });
  await expect(requiresEvidence).not.toBeChecked();
  await requiresEvidence.click();
  await dialog.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: `Editar ${company.name}` }).click();
  await expect(
    page.getByRole("dialog").getByRole("checkbox", { name: "Exige evidências" }),
  ).toBeChecked();
});

test("an execution's drawer shows its two photos and the check-out text", async ({ page }) => {
  const finished = await finishedExecutionWithEvidence();

  await page.goto("/execucoes");
  await page
    .getByRole("button", { name: `Ver detalhe da execução de ${finished.worker.fullName}` })
    .click();

  const drawer = page.getByRole("dialog", { name: "Detalhe da execução" });
  const evidence = drawer
    .getByRole("heading", { name: "Evidências", exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(evidence.getByRole("button")).toHaveCount(2);
  const complaints = drawer
    .getByRole("heading", { name: "Reclamações e Sugestões" })
    .locator("xpath=ancestor::section[1]");
  await expect(complaints).toContainText("E2E: torneira da pia vazando");
  await expect(complaints).toContainText("E2E: faltou papel toalha");
});
