import { expect, type Locator, type Page, test } from "@playwright/test";

import { SeedApi, uniqueSuffix } from "./support/api";
import { executionAwaitingReview } from "./support/fieldActivity";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager });

interface BuildingRecord {
  id: string;
  name: string;
  footprint: { type: string; coordinates: number[][][] } | null;
  footprint_source: string | null;
}

interface PointRecord {
  name: string;
  latitude: number;
  longitude: number;
}

/** Presses at one spot of `target` and releases at another, as a person drags with the mouse.
 * Spots are fractions of the element's box. */
async function dragAcross(
  page: Page,
  target: Locator,
  from: [number, number],
  to: [number, number],
) {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("dragAcross: the map has no bounding box; expected it to be rendered.");
  }
  const at = ([x, y]: [number, number]) => [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]), { steps: 4 });
  await page.mouse.move(...at(to), { steps: 4 });
  await page.mouse.up();
}

function ringOf(building: BuildingRecord): number[][] {
  return building.footprint?.coordinates[0] ?? [];
}

function insideBox(point: PointRecord, ring: number[][]): boolean {
  const lons = ring.map(([lon]) => lon ?? 0);
  const lats = ring.map(([, lat]) => lat ?? 0);

  return (
    point.longitude >= Math.min(...lons) &&
    point.longitude <= Math.max(...lons) &&
    point.latitude >= Math.min(...lats) &&
    point.latitude <= Math.max(...lats)
  );
}

async function buildingNamed(name: string): Promise<BuildingRecord> {
  const api = await SeedApi.signIn("manager");
  const buildings = await api.get<BuildingRecord[]>("/buildings");
  await api.dispose();
  const building = buildings.find((candidate) => candidate.name === name);
  if (building === undefined) {
    throw new Error(`building "${name}" not found; expected the spec to have created it.`);
  }

  return building;
}

const MAP = "Mapa dos prédios do campus";

async function openBuildingFromAddress(page: Page, buildingId: string) {
  await page.goto(`/predios?predio=${buildingId}`);
  await expect(
    page.getByRole("region", { name: MAP }).locator(".leaflet-tile-loaded").first(),
  ).toBeVisible();
}

/** The card the map opens over the selected building. */
const card = (page: Page) => page.locator(".leaflet-popup");

test("a building is drawn as a rectangle and, once registered, is selected with its card", async ({
  page,
}) => {
  const name = `E2E Prédio ${uniqueSuffix()}`;
  await page.goto("/predios");
  const map = page.getByRole("region", { name: MAP });
  await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();

  await page.getByRole("button", { name: "Desenhar prédio" }).click();
  await dragAcross(page, map, [0.12, 0.12], [0.2, 0.2]);
  const popup = page.locator(".leaflet-popup");
  await expect(popup.getByLabel("Nome")).toBeFocused();
  // Regression: opened before React filled it, the popup grew past the top of the map.
  const [popupBox, mapBox] = [await popup.boundingBox(), await map.boundingBox()];
  expect(popupBox?.y ?? -1).toBeGreaterThanOrEqual(mapBox?.y ?? 0);
  await popup.getByLabel("Nome").fill(name);
  await popup.getByLabel("Área do campus").fill("E2E");
  await popup.getByRole("button", { name: "Cadastrar" }).click();

  await expect(card(page).getByText(name)).toBeVisible();
  await expect(card(page).getByText("0 andares · 0 pontos")).toBeVisible();
  await expect(page.getByRole("region", { name: `Pontos de serviço · ${name}` })).toBeVisible();
  const created = await buildingNamed(name);
  expect(page.url()).toContain(`predio=${created.id}`);
  expect(created.footprint_source).toBe("drawn");
  expect(ringOf(created)).toHaveLength(5);
});

test("closing the drawing's popup throws the drawing away", async ({ page }) => {
  await page.goto("/predios");
  const map = page.getByRole("region", { name: MAP });
  await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await page.getByRole("button", { name: "Desenhar prédio" }).click();
  await dragAcross(page, map, [0.12, 0.12], [0.2, 0.2]);
  await page.locator(".leaflet-popup").getByRole("button", { name: "Cancelar" }).click();

  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
});

test("nothing shows below the map until a building is selected", async ({ page }) => {
  await page.goto("/predios");
  await expect(page.getByRole("region", { name: MAP })).toBeVisible();

  await expect(page.getByRole("region", { name: /^Pontos de serviço/ })).toHaveCount(0);
});

test("the pencil opens the building's dialog: rename, floors and QR codes", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept("E2E: primeira impressão"));
  const api = await SeedApi.signIn("manager");
  const site = await api.createSite(uniqueSuffix(), 0);
  await api.dispose();
  await openBuildingFromAddress(page, site.building.id);

  await card(page)
    .getByRole("button", { name: `Editar ${site.building.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Editar prédio" });
  const nameField = dialog.locator("#building-name");
  await nameField.fill(`${site.building.name} editado`);
  await dialog.getByRole("button", { name: "Salvar alterações" }).first().click();
  await expect(dialog.getByText("Dados do prédio salvos.")).toBeVisible();

  await dialog.getByRole("button", { name: "Gerar QR" }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "QR Code gerado" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Revogar QR" })).toBeEnabled();
});

test("points are created, edited and removed in dialogs, with no coordinates", async ({ page }) => {
  const api = await SeedApi.signIn("manager");
  const site = await api.createSite(uniqueSuffix(), 0);
  const pointName = `E2E Sala dialog ${uniqueSuffix()}`;
  await openBuildingFromAddress(page, site.building.id);
  const panel = page.getByRole("region", { name: `Pontos de serviço · ${site.building.name}` });

  await panel.getByRole("button", { name: "Novo ponto" }).click();
  const create = page.getByRole("dialog", { name: "Novo ponto de serviço" });
  await expect(create.getByLabel("Latitude")).toHaveCount(0);
  await create.getByLabel("Andar").selectOption({ label: site.floor.label });
  await create.getByLabel("Nome").fill(pointName);
  await create.getByLabel("Descrição").fill("Laboratório");
  await create.getByRole("button", { name: "Cadastrar" }).click();
  await expect(panel.getByText(pointName)).toBeVisible();

  await panel.getByRole("button", { name: `Editar ${pointName}` }).click();
  const edit = page.getByRole("dialog", { name: "Editar ponto de serviço" });
  await edit.getByLabel("Nome").fill(`${pointName} 2`);
  await edit.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(panel.getByText(`${pointName} 2`)).toBeVisible();

  const [saved] = await api.get<PointRecord[]>(`/service-points?building_id=${site.building.id}`);
  const building = await buildingNamed(site.building.name);
  expect(saved !== undefined && insideBox(saved, ringOf(building))).toBe(true);

  await panel.getByRole("button", { name: `Remover ${pointName} 2` }).click();
  const confirm = page.getByRole("dialog", { name: `Remover ${pointName} 2?` });
  await expect(confirm.getByText("Esta ação não pode ser desfeita.")).toBeVisible();
  await confirm.getByRole("button", { name: "Remover" }).click();
  // While a dialog is open the panel is aria-hidden: wait for it to close before reading it.
  await expect(confirm).toHaveCount(0);
  await expect(panel.getByText(`${pointName} 2`)).toHaveCount(0);
  expect(await api.get<PointRecord[]>(`/service-points?building_id=${site.building.id}`)).toEqual(
    [],
  );
  await api.dispose();
});

test("removing a building takes its history with it, after saying what goes", async ({ page }) => {
  const started = await executionAwaitingReview();
  await openBuildingFromAddress(page, started.building.id);

  await card(page)
    .getByRole("button", { name: `Editar ${started.building.name}` })
    .click();
  await page.getByRole("button", { name: "Remover prédio" }).click();
  const confirm = page.getByRole("dialog", { name: `Remover ${started.building.name}?` });
  await expect(confirm.getByText("1 execução")).toBeVisible();
  await expect(confirm.getByText("1 rota")).toBeVisible();
  await confirm.getByRole("button", { name: "Remover" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/predio=/);
  const api = await SeedApi.signIn("manager");
  const buildings = await api.get<BuildingRecord[]>("/buildings");
  const routes = await api.get<{ id: string }[]>("/routes");
  await api.dispose();
  expect(buildings.some((building) => building.id === started.building.id)).toBe(false);
  expect(routes.some((route) => route.id === started.routeId)).toBe(false);
});

test("redrawing a building moves its outline and its points", async ({ page }) => {
  const api = await SeedApi.signIn("manager");
  const site = await api.createSite(uniqueSuffix(), 1);
  const [before] = await api.get<PointRecord[]>(`/service-points?building_id=${site.building.id}`);
  await openBuildingFromAddress(page, site.building.id);

  await card(page)
    .getByRole("button", { name: `Editar ${site.building.name}` })
    .click();
  await page.getByRole("button", { name: "Redesenhar contorno" }).click();
  await expect(page.getByText(`novo contorno de ${site.building.name}`)).toBeVisible();
  await dragAcross(page, page.getByRole("region", { name: MAP }), [0.6, 0.6], [0.7, 0.7]);
  await page.locator(".leaflet-popup").getByRole("button", { name: "Substituir contorno" }).click();

  await expect(page.locator(".leaflet-popup").getByText("Substituir contorno")).toHaveCount(0);
  const [after] = await api.get<PointRecord[]>(`/service-points?building_id=${site.building.id}`);
  await api.dispose();
  const redrawn = await buildingNamed(site.building.name);
  expect(after?.latitude).not.toBe(before?.latitude);
  expect(after !== undefined && insideBox(after, ringOf(redrawn))).toBe(true);
});

test("old building addresses land on the map with the building selected", async ({ page }) => {
  const api = await SeedApi.signIn("manager");
  const site = await api.createSite(uniqueSuffix(), 0);
  await api.dispose();

  await page.goto(`/predios/${site.building.id}/andares`);
  await expect(page).toHaveURL(new RegExp(`/predios\\?predio=${site.building.id}$`));
  await expect(
    page.getByRole("region", { name: `Pontos de serviço · ${site.building.name}` }),
  ).toBeVisible();

  await page.goto("/pontos-de-servico");
  await expect(page).toHaveURL(/\/predios$/);
});

/** Hovers each outline on the board map until one shows `name`, then clicks it. */
async function openBuildingOnBoard(board: Locator, name: string): Promise<boolean> {
  for (const outline of await board.locator("path.leaflet-interactive").all()) {
    await outline.dispatchEvent("mouseover");
    const ours = (await board.locator(".leaflet-tooltip", { hasText: name }).count()) > 0;
    await outline.dispatchEvent("mouseout");
    if (ours) {
      await outline.dispatchEvent("click");

      return true;
    }
  }

  return false;
}

test("the Quadro de rotas draws the building and opens its points and registry", async ({
  page,
}) => {
  const api = await SeedApi.signIn("manager");
  const site = await api.createSite(uniqueSuffix(), 2);
  await api.dispose();
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto("/rotas");
  const board = page.getByRole("region", { name: "Mapa da operação" });
  await expect(board.locator(".leaflet-tile-loaded").first()).toBeVisible();

  // Outlines are SVG paths with no name: find ours by the tooltip it shows on hover.
  await expect
    .poll(() => openBuildingOnBoard(board, site.building.name), { timeout: 15_000 })
    .toBe(true);

  const panel = page.getByRole("region", { name: site.building.name });
  await expect(panel.getByText(site.points[0]?.name ?? "")).toBeVisible();
  await expect(panel.getByText(site.points[1]?.name ?? "")).toBeVisible();
  await panel.getByRole("link", { name: "Abrir cadastro do prédio" }).click();
  await expect(page).toHaveURL(new RegExp(`predio=${site.building.id}$`));
});
