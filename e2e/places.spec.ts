import { expect, type Page, test } from "@playwright/test";

import { SeedApi, uniqueSuffix } from "./support/api";
import { STORAGE } from "./support/users";

test.use({ storageState: STORAGE.manager });

interface PlaceRecord {
  id: string;
  name: string;
}

interface PointRecord {
  service_type_name: string | null;
  active: boolean;
}

const MAP = "Mapa dos prédios do campus";

/** The card the map opens over the selected pin. */
const card = (page: Page) => page.locator(".leaflet-popup");

async function placesNamed(name: string): Promise<PlaceRecord[]> {
  const api = await SeedApi.signIn("manager");
  const places = await api.get<PlaceRecord[]>("/places");
  await api.dispose();

  return places.filter((place) => place.name === name);
}

async function servicesOf(placeId: string): Promise<PointRecord[]> {
  const api = await SeedApi.signIn("manager");
  const points = await api.get<PointRecord[]>(`/service-points?place_id=${placeId}`);
  await api.dispose();

  return points;
}

/** Marks a place with the pin tool: "Marcar local", a click on the map, then "Novo local". */
async function pinPlace(page: Page, name: string, serviceName: string) {
  await page.goto("/predios");
  const map = page.getByRole("region", { name: MAP });
  await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();

  await page.getByRole("button", { name: "Marcar local" }).click();
  await expect(page.getByText("Clique no mapa para marcar o local.")).toBeVisible();
  const box = await map.boundingBox();
  if (box === null) {
    throw new Error("pinPlace: the map has no bounding box; expected it to be rendered.");
  }
  // The map is framed on the campus, so any spot inside it is on campus.
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.35);

  const dialog = page.getByRole("dialog", { name: "Novo local" });
  await dialog.getByLabel("Nome do local").fill(name);
  await dialog.getByLabel("Serviço").selectOption({ label: serviceName });
  await dialog.getByRole("button", { name: "Cadastrar" }).click();
  await expect(dialog).toHaveCount(0);
}

test("a place is pinned on the map and, once registered, is selected with its card", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const name = `E2E Local ${suffix}`;
  const api = await SeedApi.signIn("manager");
  const company = await api.createCompany(suffix);
  await api.dispose();

  await pinPlace(page, name, company.serviceType.name);

  await expect(card(page).getByText(name)).toBeVisible();
  await expect(card(page).getByText("1 serviço")).toBeVisible();
  const [created] = await placesNamed(name);
  expect(created).toBeDefined();
  expect(page.url()).toContain(`local=${created?.id ?? ""}`);
  const services = await servicesOf(created?.id ?? "");
  expect(services.map((service) => service.service_type_name)).toEqual([company.serviceType.name]);
});

test("a place's dialog adds a service, turns one off and removes the place after asking", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const api = await SeedApi.signIn("manager");
  const first = await api.createCompany(`${suffix}a`);
  const second = await api.createCompany(`${suffix}b`);
  const place = await api.createPlace(suffix, first.serviceType.id);
  await api.dispose();
  const deletions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "DELETE") {
      deletions.push(request.url());
    }
  });
  await page.goto(`/predios?local=${place.id}`);
  await expect(card(page).getByText(place.name)).toBeVisible();
  await card(page)
    .getByRole("button", { name: `Editar ${place.name}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Editar local" });
  const service = (name: string) => dialog.getByRole("checkbox", { name, exact: true });
  await expect(service(first.serviceType.name)).toBeChecked();

  // A second service on the same place.
  await dialog.getByRole("button", { name: "Adicionar serviço" }).click();
  const addService = page.getByRole("dialog", { name: "Adicionar serviço" });
  await addService.getByLabel("Tipo de serviço").selectOption({ label: second.serviceType.name });
  await addService.getByRole("button", { name: "Adicionar" }).click();
  await expect(addService).toHaveCount(0);
  await expect(service(second.serviceType.name)).toBeChecked();
  await expect(card(page).getByText("2 serviços")).toBeVisible();

  // Controlled by the server state: click, then wait for the PATCH + refetch to flip it.
  await service(first.serviceType.name).click();
  await expect(service(first.serviceType.name)).not.toBeChecked();
  await expect(service(second.serviceType.name)).toBeChecked();
  const services = await servicesOf(place.id);
  expect(services.find((point) => point.service_type_name === first.serviceType.name)?.active).toBe(
    false,
  );

  // Removing asks first: nothing is deleted until the confirmation.
  await dialog.getByRole("button", { name: `Remover local ${place.name}` }).click();
  const confirm = page.getByRole("dialog", { name: `Remover ${place.name}?` });
  await expect(confirm.getByRole("button", { name: "Remover" })).toBeEnabled();
  expect(deletions).toHaveLength(0);
  expect(await placesNamed(place.name)).toHaveLength(1);
  await confirm.getByRole("button", { name: "Remover" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/local=/);
  expect(deletions).toHaveLength(1);
  expect(await placesNamed(place.name)).toHaveLength(0);
});

test("the Quadro de rotas draws the place's pin and opens its services panel", async ({ page }) => {
  const suffix = uniqueSuffix();
  const api = await SeedApi.signIn("manager");
  const company = await api.createCompany(suffix);
  const place = await api.createPlace(suffix, company.serviceType.id);
  await api.dispose();
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto("/rotas");
  const board = page.getByRole("region", { name: "Mapa da operação" });
  await expect(board.locator(".leaflet-tile-loaded").first()).toBeVisible();

  // The pin's accessible name is the place's name followed by today's visit status.
  await board.getByRole("button", { name: new RegExp(`^${place.name}`) }).click();

  const panel = page.getByRole("region", { name: place.name });
  await expect(panel.getByText(company.serviceType.name)).toBeVisible();
  await panel.getByRole("link", { name: "Abrir cadastro do local" }).click();
  await expect(page).toHaveURL(new RegExp(`local=${place.id}$`));
});
