import { expect, test } from "@playwright/test";

import { SeedApi } from "./support/api";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager });

const THRESHOLD = "Sem evidência — Limiar (minutos)";
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

/** The global "sem evidência" grace the rule falls back to (Configurações). */
async function globalDefault(): Promise<number> {
  const api = await SeedApi.signIn("manager");
  const settings = await api.get<{ no_evidence_grace_min: number }>("/settings");
  await api.dispose();

  return settings.no_evidence_grace_min;
}

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

  // Emptying the field means "usar o padrão global"; the API used to ignore it. The input then
  // shows the effective threshold, the global default, marked as such.
  await page.getByLabel(THRESHOLD).fill("");
  await page.getByLabel(THRESHOLD).blur();
  await expect(page.getByRole("status")).toHaveText("Regra atualizada.");
  await page.reload();
  await expect(page.getByLabel(THRESHOLD)).toHaveValue(String(await globalDefault()));
  await expect(page.getByRole("row").filter({ hasText: "Sem evidência" })).toContainText(
    "Padrão global",
  );
});

test("lists the five alert kinds of the automatic allocation, each with its switch", async ({
  page,
}) => {
  await page.goto("/regras-de-alerta");
  // The kinds that depended on a planned schedule (late start, absent worker, late stop) are gone.
  const kinds = [
    "Sem evidência",
    "Ponto impedido",
    "Lote liberado",
    "Pontos não atendidos",
    "Recurso recebido",
  ];
  for (const kind of kinds) {
    await expect(page.getByRole("checkbox", { name: kind, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("checkbox")).toHaveCount(kinds.length);
  // Only "Sem evidência" waits for a threshold; the others fire on the event itself.
  await expect(page.getByText("Dispara no próprio evento")).toHaveCount(kinds.length - 1);
});
