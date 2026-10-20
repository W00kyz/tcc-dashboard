import { expect, test } from "@playwright/test";

import { SeedApi, uniqueSuffix } from "./support/api";
import { executionWithMediaAnswer } from "./support/fieldActivity";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager, viewport: { width: 1440, height: 1200 } });

test("a form gets a 'Mídia (fotos)' question and publishes it", async ({ page }) => {
  const api = await SeedApi.signIn("manager");
  const serviceType = await api.post<{ id: string; name: string }>("/service-types", {
    name: `E2E Tipo mídia ${uniqueSuffix()}`,
    average_duration_minutes: 30,
  });
  await api.dispose();

  await page.goto("/formularios");
  await page.getByLabel("Tipo de serviço").selectOption({ label: serviceType.name });
  await page.getByRole("button", { name: "Adicionar pergunta" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Enunciado").fill("Foto do piso após a limpeza");
  await dialog.getByLabel("Tipo").selectOption({ label: "Mídia (fotos)" });
  await expect(dialog.getByText("Opções")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Salvar pergunta" }).click();

  const row = page.getByRole("listitem").filter({ hasText: "Foto do piso após a limpeza" });
  await expect(row.getByText("Mídia (fotos)")).toBeVisible();
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await page.getByRole("button", { name: "Publicar versão" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the execution shows each photo under its question, and the ones not received yet", async ({
  page,
}) => {
  const prompt = "Foto do piso após a limpeza";
  const arranged = await executionWithMediaAnswer(prompt);

  await page.goto(`/execucoes?date_from=&service_point_id=${arranged.servicePointId}`);
  await page
    .getByRole("button", { name: /Ver detalhe da execução de/ })
    .first()
    .click();

  const answer = page.getByRole("listitem").filter({ hasText: `${prompt}:` });
  await expect(answer.getByRole("img", { name: "Evidência fotográfica" })).toHaveCount(1);
  await expect(answer.getByText("Foto ainda não recebida")).toBeVisible();
  // The photo answers the question: it is not repeated among the loose evidence.
  await expect(page.getByText("Nenhuma evidência registrada.")).toBeVisible();
});
