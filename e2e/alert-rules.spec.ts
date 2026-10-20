import { expect, test } from "@playwright/test";

import { SeedApi } from "./support/api";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager });

const THRESHOLD = "Execução sem evidência — Limiar (minutos)";
const RULE = "NO_EVIDENCE";

interface AlertRule {
  rule_kind: string;
  threshold_minutes: number | null;
}

// The spec edits a real rule; whatever happens mid-test, the rule goes back to how it was.
let original: AlertRule | undefined;

test.beforeAll(async () => {
  const api = await SeedApi.signIn("manager");
  const rules = await api.get<AlertRule[]>("/alert-rules");
  original = rules.find((rule) => rule.rule_kind === RULE);
  await api.dispose();
});

test.afterAll(async () => {
  if (original === undefined) {
    return;
  }
  const api = await SeedApi.signIn("manager");
  await api.patch(`/alert-rules/${RULE}`, { threshold_minutes: original.threshold_minutes });
  await api.dispose();
});

test("a threshold can be overridden and then cleared back to the global default", async ({
  page,
}) => {
  await page.goto("/regras-de-alerta");
  const input = page.getByLabel(THRESHOLD);

  await input.fill("25");
  await input.blur();
  await expect(page.getByRole("status")).toHaveText("Regra atualizada.");
  await page.reload();
  await expect(page.getByLabel(THRESHOLD)).toHaveValue("25");

  // Emptying the field means "usar o padrão global"; the API used to ignore it.
  await page.getByLabel(THRESHOLD).fill("");
  await page.getByLabel(THRESHOLD).blur();
  await expect(page.getByRole("status")).toHaveText("Regra atualizada.");
  await page.reload();
  await expect(page.getByLabel(THRESHOLD)).toHaveValue("");
});
