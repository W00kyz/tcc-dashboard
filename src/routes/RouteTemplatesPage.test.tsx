import { isValidElement } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { RouteTemplatesPage } from "@/routes/RouteTemplatesPage";

const BUILDINGS = [{ id: "b1", name: "Bloco CI", campus_area: "CCT" }];
const FLOORS = [{ id: "f1", building_id: "b1", label: "Térreo" }];
const SERVICE_POINTS = [
  { id: "sp1", floor_id: "f1", name: "Sala 101" },
  { id: "sp2", floor_id: "f1", name: "Sala 102" },
];
const WORKERS = [
  {
    id: "w1",
    full_name: "João da Silva",
    contractor_company_id: "c1",
    service_type_ids: [],
    user_id: null,
  },
];

const DAILY_TEMPLATE = {
  id: "t1",
  name: "Ronda matinal",
  field_worker_id: null,
  recurrence: "DAILY",
  weekdays: null,
  route_type: "REGULAR",
  is_active: true,
  stops: [],
};
const WEEKLY_TEMPLATE = {
  ...DAILY_TEMPLATE,
  id: "t2",
  name: "Ronda de quarta",
  recurrence: "WEEKLY",
  weekdays: [3],
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface FakeFetchOptions {
  templates?: unknown[];
  writeStatus?: number;
}

function makeFakeFetch(options: FakeFetchOptions = {}) {
  const { templates = [DAILY_TEMPLATE], writeStatus = 201 } = options;

  return vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    const method = input instanceof Request ? input.method : "GET";
    if (url.includes("/buildings")) {
      return Promise.resolve(jsonResponse(BUILDINGS));
    }
    if (url.includes("/floors")) {
      return Promise.resolve(jsonResponse(FLOORS));
    }
    if (url.includes("/service-points")) {
      return Promise.resolve(jsonResponse(SERVICE_POINTS));
    }
    if (url.includes("/field-workers")) {
      return Promise.resolve(jsonResponse(WORKERS));
    }
    if (url.includes("/materialize")) {
      return Promise.resolve(jsonResponse({ id: "r-new", route_date: "2026-09-15" }, writeStatus));
    }
    if (url.includes("/route-templates") && method === "GET") {
      return Promise.resolve(jsonResponse(templates));
    }

    return Promise.resolve(jsonResponse({ ...DAILY_TEMPLATE, id: "t-new" }, writeStatus));
  });
}

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <MemoryRouter initialEntries={["/templates-de-rota"]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <LocationProbe />
          <Routes>
            <Route path="/templates-de-rota" element={<RouteTemplatesPage />} />
            <Route path="/rotas" element={<div>Quadro de rotas</div>} />
          </Routes>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function pickBuildingFloor(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "Bloco CI" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Prédio" }), "b1");
  await screen.findByRole("option", { name: "Térreo" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Andar" }), "f1");
  await screen.findByRole("option", { name: "Sala 101" });
}

async function addPoint(user: ReturnType<typeof userEvent.setup>, servicePointId: string) {
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Adicionar ponto" }),
    servicePointId,
  );
  await user.click(screen.getByRole("button", { name: "Adicionar ponto" }));
}

async function findRequest(
  fakeFetch: ReturnType<typeof makeFakeFetch>,
  method: string,
  urlPart: string,
) {
  return vi.waitFor(() => {
    const call = fakeFetch.mock.calls.find(
      ([request]) =>
        request instanceof Request && request.method === method && request.url.includes(urlPart),
    );
    if (call === undefined) {
      throw new Error(`expected a ${method} ${urlPart} request`);
    }

    return call;
  });
}

describe("RouteTemplatesPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a DAILY template whose stops carry raw HH:MM windows, not datetimes", async () => {
    const fakeFetch = makeFakeFetch({ templates: [] });
    const user = userEvent.setup();
    renderPage(fakeFetch);

    await user.type(screen.getByLabelText("Nome"), "Ronda matinal");
    await pickBuildingFloor(user);
    await addPoint(user, "sp1");
    await addPoint(user, "sp2");

    const fromInputs = screen.getAllByLabelText("Chegada prevista (início)");
    const firstFrom = fromInputs[0];
    if (firstFrom === undefined) {
      throw new Error("expected two arrival-window inputs to render");
    }
    fireEvent.change(firstFrom, { target: { value: "08:00" } });

    await user.click(screen.getByRole("button", { name: "Salvar template" }));

    const postCall = await findRequest(fakeFetch, "POST", "/route-templates");
    const body = (await (postCall[0] as Request).clone().json()) as {
      recurrence: string;
      weekdays: number[] | null;
      stops: {
        service_point_id: string;
        expected_arrival_from: string | null;
        expected_arrival_to: string | null;
      }[];
    };
    expect(body.recurrence).toBe("DAILY");
    expect(body.weekdays).toBeNull();
    expect(body.stops).toEqual([
      { service_point_id: "sp1", expected_arrival_from: "08:00", expected_arrival_to: null },
      { service_point_id: "sp2", expected_arrival_from: null, expected_arrival_to: null },
    ]);
    expect(JSON.stringify(body.stops)).not.toContain("Z");
  });

  it("blocks the WEEKLY submit until a weekday is checked, then sends weekdays", async () => {
    const fakeFetch = makeFakeFetch({ templates: [] });
    const user = userEvent.setup();
    renderPage(fakeFetch);

    await user.selectOptions(screen.getByLabelText("Recorrência"), "WEEKLY");
    const submit = screen.getByRole("button", { name: "Salvar template" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("Selecione ao menos um dia da semana.")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Ter" }));
    expect(submit).toBeEnabled();

    await user.type(screen.getByLabelText("Nome"), "Ronda de terça");
    await user.click(submit);

    const postCall = await findRequest(fakeFetch, "POST", "/route-templates");
    const body = (await (postCall[0] as Request).clone().json()) as {
      recurrence: string;
      weekdays: number[] | null;
    };
    expect(body.recurrence).toBe("WEEKLY");
    expect(body.weekdays).toEqual([2]);
  });

  it("materializes a listed template and lands on the board filtered to that date", async () => {
    const fakeFetch = makeFakeFetch({ templates: [DAILY_TEMPLATE] });
    const user = userEvent.setup();
    renderPage(fakeFetch);

    await user.click(await screen.findByRole("button", { name: "Materializar" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Data da rota"), {
      target: { value: "2026-09-15" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Materializar rota" }));

    const call = await findRequest(fakeFetch, "POST", "/route-templates/t1/materialize");
    const body = (await (call[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).toEqual({ route_date: "2026-09-15" });

    expect(await screen.findByTestId("location")).toHaveTextContent("/rotas?date=2026-09-15");
  });

  it("toggles a template active flag with a PATCH { is_active: false }", async () => {
    const fakeFetch = makeFakeFetch({ templates: [DAILY_TEMPLATE] });
    const user = userEvent.setup();
    renderPage(fakeFetch);

    const row = await screen.findByTestId("template-row-t1");
    await user.click(within(row).getByRole("checkbox", { name: "Ativo" }));

    const call = await findRequest(fakeFetch, "PATCH", "/route-templates/t1");
    const body = (await (call[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).toEqual({ is_active: false });
  });

  it("surfaces a row-level alert when the active toggle PATCH fails", async () => {
    const fakeFetch = makeFakeFetch({ templates: [DAILY_TEMPLATE], writeStatus: 500 });
    const user = userEvent.setup();
    renderPage(fakeFetch);

    const row = await screen.findByTestId("template-row-t1");
    await user.click(within(row).getByRole("checkbox", { name: "Ativo" }));

    expect(await within(row).findByRole("alert")).toHaveTextContent(
      "Não foi possível alterar o status do template.",
    );
  });

  it("defaults the materialize date to the next date matching a WEEKLY recurrence", async () => {
    const fakeFetch = makeFakeFetch({ templates: [WEEKLY_TEMPLATE] });
    const user = userEvent.setup();
    renderPage(fakeFetch);

    await user.click(await screen.findByRole("button", { name: "Materializar" }));
    const dialog = await screen.findByRole("dialog");
    const dateInput = within(dialog).getByLabelText<HTMLInputElement>("Data da rota");

    const chosen = new Date(`${dateInput.value}T00:00:00`);
    const chosenIsoWeekday = chosen.getDay() === 0 ? 7 : chosen.getDay();
    expect(chosenIsoWeekday).toBe(3);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(chosen.getTime()).toBeGreaterThanOrEqual(today.getTime());
  });

  it("registers /templates-de-rota under the MANAGER/ADMIN ProtectedRoute", () => {
    const managerBranch = appRoutes.find((branch) =>
      branch.children?.some((child) => child.path === "/rotas"),
    );

    const branchElement = managerBranch?.element;
    expect(isValidElement(branchElement) && branchElement.type).toBe(ProtectedRoute);
    expect(managerBranch?.children?.map((child) => child.path)).toContain("/templates-de-rota");
  });
});
