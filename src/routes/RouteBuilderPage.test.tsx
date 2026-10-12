import { isValidElement, type ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { ConsentGate } from "@/auth/ConsentGate";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { RouteBoardPage } from "@/routes/RouteBoardPage";
import { RouteBuilderPage } from "@/routes/RouteBuilderPage";

const BUILDINGS = [{ id: "b1", name: "Bloco CI", campus_area: "CCT" }];
const FLOORS = [{ id: "f1", building_id: "b1", label: "Térreo" }];
const SERVICE_POINTS = [
  { id: "sp1", floor_id: "f1", name: "Sala 101" },
  { id: "sp2", floor_id: "f1", name: "Sala 102" },
];
const SERVICE_TYPES = [
  { id: "st1", name: "Limpeza", average_duration_minutes: 30 },
  { id: "st2", name: "Jardinagem", average_duration_minutes: 45 },
];
const WORKERS = [
  {
    id: "w1",
    full_name: "João da Silva",
    contractor_company_id: "c1",
    service_type_ids: [],
    user_id: null,
  },
  {
    id: "w2",
    full_name: "Maria Souza",
    contractor_company_id: "c1",
    service_type_ids: [],
    user_id: null,
  },
];
const EMPTY_ROUTE = {
  id: "r99",
  field_worker_id: "w1",
  field_worker_name: "João da Silva",
  route_date: "2026-09-01",
  route_type: "REGULAR",
  status: "PLANNED",
  scheduled_start_at: null,
  started_at: null,
  routing_degraded: false,
  stops: [],
};
// Served by the fake for a GET /routes *list* so the board rendered after a successful
// occasional create has a card to show.
const BOARD_ROUTE = {
  id: "board1",
  field_worker_id: "w1",
  field_worker_name: "João da Silva",
  route_date: "2026-09-01",
  route_type: "OCCASIONAL",
  status: "PLANNED",
  scheduled_start_at: null,
  started_at: null,
  routing_degraded: false,
  stops: [],
};

interface FakeFetchOptions {
  routeBody?: unknown;
  routeStatus?: number;
  writeStatus?: number;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function makeFakeFetch(options: FakeFetchOptions = {}) {
  const { routeBody = EMPTY_ROUTE, routeStatus = 200, writeStatus = 201 } = options;

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
    if (url.includes("/service-types")) {
      return Promise.resolve(jsonResponse(SERVICE_TYPES));
    }
    // The board it lands on after saving groups routes by company.
    if (url.includes("/contractor-companies")) {
      return Promise.resolve(jsonResponse([]));
    }
    if (method === "GET" && /\/routes\/[^/]+$/.exec(url)) {
      return Promise.resolve(jsonResponse(routeBody, routeStatus));
    }
    if (method === "GET" && url.includes("/routes")) {
      return Promise.resolve(jsonResponse([BOARD_ROUTE]));
    }

    return Promise.resolve(jsonResponse({ id: "r99" }, writeStatus));
  });
}

function renderBuilder(path: string, fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Routes>
            <Route path="/rotas/nova" element={<RouteBuilderPage />} />
            <Route path="/rotas/:routeId/editar" element={<RouteBuilderPage />} />
            <Route path="/rotas" element={<RouteBoardPage />} />
          </Routes>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// Drives @dnd-kit's real KeyboardSensor: Space to grab the focused handle, Arrow to move one
// slot, Space to drop. Relies on the <li> rect stub in src/test/setup.ts.
async function keyboardReorder(
  user: ReturnType<typeof userEvent.setup>,
  handle: HTMLElement,
  arrow: "{ArrowUp}" | "{ArrowDown}",
) {
  handle.focus();
  await user.keyboard("{ }");
  await user.keyboard(arrow);
  await user.keyboard("{ }");
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

async function findWriteCall(fakeFetch: ReturnType<typeof makeFakeFetch>, method: string) {
  return vi.waitFor(() => {
    const call = fakeFetch.mock.calls.find(([request]) => (request as Request).method === method);
    if (call === undefined) {
      throw new Error(`expected a ${method} /routes request`);
    }

    return call;
  });
}

describe("RouteBuilderPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the stops in the on-screen order after a keyboard-sensor reorder", async () => {
    const fakeFetch = makeFakeFetch();
    const user = userEvent.setup();
    renderBuilder("/rotas/nova?type=REGULAR", fakeFetch);

    await pickBuildingFloor(user);
    await addPoint(user, "sp1");
    await addPoint(user, "sp2");

    const firstHandle = screen.getAllByRole("button", { name: "Reordenar ponto" })[0];
    if (firstHandle === undefined) {
      throw new Error("expected two drag handles to render");
    }
    await keyboardReorder(user, firstHandle, "{ArrowDown}");

    await user.selectOptions(screen.getByRole("combobox", { name: "Profissional" }), "w1");
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-09-01" } });
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const postCall = await findWriteCall(fakeFetch, "POST");
    const body = (await (postCall[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).toEqual({
      field_worker_id: "w1",
      route_date: "2026-09-01",
      route_type: "REGULAR",
      stops: [
        { service_point_id: "sp2", expected_arrival_from: null, expected_arrival_to: null },
        { service_point_id: "sp1", expected_arrival_from: null, expected_arrival_to: null },
      ],
    });
  });

  it("posts the picked service type for a stop, and omits it when left blank", async () => {
    const fakeFetch = makeFakeFetch();
    const user = userEvent.setup();
    renderBuilder("/rotas/nova?type=REGULAR", fakeFetch);

    await pickBuildingFloor(user);
    await addPoint(user, "sp1");
    await addPoint(user, "sp2");

    const serviceTypeSelects = await screen.findAllByRole("combobox", {
      name: "Tipo de serviço",
    });
    await user.selectOptions(serviceTypeSelects[0] as HTMLSelectElement, "st1");
    // The second stop is left on the blank "— nenhum —" option deliberately.

    await user.selectOptions(screen.getByRole("combobox", { name: "Profissional" }), "w1");
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-09-01" } });
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const postCall = await findWriteCall(fakeFetch, "POST");
    const body = (await (postCall[0] as Request).clone().json()) as {
      stops: Record<string, unknown>[];
    };
    expect(body.stops[0]).toMatchObject({ service_point_id: "sp1", service_type_id: "st1" });
    expect(body.stops[1]).not.toHaveProperty("service_type_id");
  });

  it("combines the route date and each stop time into a UTC (Z-suffixed) instant", async () => {
    const fakeFetch = makeFakeFetch();
    const user = userEvent.setup();
    renderBuilder("/rotas/nova?type=REGULAR", fakeFetch);

    await pickBuildingFloor(user);
    await addPoint(user, "sp1");

    fireEvent.change(screen.getByLabelText("Chegada prevista (início)"), {
      target: { value: "08:30" },
    });
    fireEvent.change(screen.getByLabelText("Chegada prevista (fim)"), {
      target: { value: "09:00" },
    });
    await user.selectOptions(screen.getByRole("combobox", { name: "Profissional" }), "w1");
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-09-01" } });
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const postCall = await findWriteCall(fakeFetch, "POST");
    const body = (await (postCall[0] as Request).clone().json()) as {
      stops: { expected_arrival_from: string; expected_arrival_to: string }[];
    };
    expect(body.stops[0]).toEqual({
      service_point_id: "sp1",
      expected_arrival_from: "2026-09-01T08:30:00Z",
      expected_arrival_to: "2026-09-01T09:00:00Z",
    });
  });

  it("hydrates the drafts from the route in edit mode and patches on save", async () => {
    const routeBody = {
      id: "r5",
      field_worker_id: "w1",
      field_worker_name: "João da Silva",
      route_date: "2026-09-01",
      route_type: "REGULAR",
      status: "PLANNED",
      scheduled_start_at: null,
      started_at: null,
      routing_degraded: false,
      stops: [
        {
          id: "s1",
          order_index: 1,
          status: "PENDING",
          service_point_id: "sp1",
          service_point_name: "Sala 101",
          expected_arrival_from: "2026-09-01T08:00:00Z",
          expected_arrival_to: null,
          service_type_id: "st2",
        },
        {
          id: "s2",
          order_index: 2,
          status: "PENDING",
          service_point_id: "sp2",
          service_point_name: "Sala 102",
          expected_arrival_from: null,
          expected_arrival_to: null,
        },
      ],
    };
    const fakeFetch = makeFakeFetch({ routeBody });
    const user = userEvent.setup();
    renderBuilder("/rotas/r5/editar", fakeFetch);

    await screen.findByText("Sala 101");
    const fromInputs = screen.getAllByLabelText("Chegada prevista (início)");
    expect((fromInputs[0] as HTMLInputElement).value).toBe("08:00");
    // The first stop's already-set service_type_id ("st2") comes back selected; the second
    // stop, which has none, sits on the blank "— nenhum —" option.
    const serviceTypeSelects = await screen.findAllByRole("combobox", {
      name: "Tipo de serviço",
    });
    expect((serviceTypeSelects[0] as HTMLSelectElement).value).toBe("st2");
    expect((serviceTypeSelects[1] as HTMLSelectElement).value).toBe("");

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const patchCall = await findWriteCall(fakeFetch, "PATCH");
    expect((patchCall[0] as Request).url).toContain("/routes/r5");
    const body = (await (patchCall[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body.stops).toEqual([
      {
        service_point_id: "sp1",
        expected_arrival_from: "2026-09-01T08:00:00Z",
        expected_arrival_to: null,
        service_type_id: "st2",
      },
      { service_point_id: "sp2", expected_arrival_from: null, expected_arrival_to: null },
    ]);
  });

  it("shows an error instead of navigating away when the save request fails", async () => {
    const fakeFetch = makeFakeFetch({ writeStatus: 500 });
    const user = userEvent.setup();
    renderBuilder("/rotas/nova?type=REGULAR", fakeFetch);

    await user.click(await screen.findByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar a rota.");
  });

  it("shows an error instead of an empty form when the route fails to load in edit mode", async () => {
    const fakeFetch = makeFakeFetch({ routeStatus: 500 });
    renderBuilder("/rotas/r5/editar", fakeFetch);

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar a rota.");
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
  });

  it("registers both builder routes under the MANAGER/ADMIN ProtectedRoute", () => {
    const managerBranch = appRoutes.find((branch) =>
      branch.children?.some((child) => child.path === "/rotas"),
    );
    const adminBranch = appRoutes.find((branch) =>
      branch.children?.some((child) => child.path === "/usuarios"),
    );

    const branchElement = managerBranch?.element;
    expect(isValidElement(branchElement) && branchElement.type).toBe(ConsentGate);
    const guarded = isValidElement<{ children?: ReactNode }>(branchElement)
      ? branchElement.props.children
      : null;
    expect(isValidElement(guarded) && guarded.type).toBe(ProtectedRoute);
    expect(managerBranch?.children?.map((child) => child.path)).toEqual(
      expect.arrayContaining(["/rotas/nova", "/rotas/:routeId/editar"]),
    );
    expect(adminBranch?.children?.map((child) => child.path)).not.toContain("/rotas/nova");
  });

  it("shows the occasional title and the RF23 hint in occasional mode", async () => {
    renderBuilder("/rotas/nova?type=OCCASIONAL", makeFakeFetch());

    expect(await screen.findByRole("heading", { name: "Nova rota eventual" })).toBeInTheDocument();
    expect(screen.getByText("não altera as rotas regulares planejadas")).toBeInTheDocument();
  });

  it("multi-selects workers and posts field_worker_ids and stops to /routes/occasional", async () => {
    const fakeFetch = makeFakeFetch();
    const user = userEvent.setup();
    renderBuilder("/rotas/nova?type=OCCASIONAL", fakeFetch);

    await user.click(await screen.findByRole("checkbox", { name: "João da Silva" }));
    await user.click(screen.getByRole("checkbox", { name: "Maria Souza" }));

    await pickBuildingFloor(user);
    await addPoint(user, "sp1");
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-09-01" } });
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const postCall = await findWriteCall(fakeFetch, "POST");
    expect((postCall[0] as Request).url).toContain("/routes/occasional");
    const body = (await (postCall[0] as Request).clone().json()) as {
      field_worker_ids: string[];
      route_date: string;
      stops: { service_point_id: string }[];
    };
    expect(body.field_worker_ids).toHaveLength(2);
    expect(body.field_worker_ids).toEqual(expect.arrayContaining(["w1", "w2"]));
    expect(body.route_date).toBe("2026-09-01");
    expect(body.stops).toHaveLength(1);
    expect(body.stops[0]?.service_point_id).toBe("sp1");

    // Lands on the board already filtered to occasional routes *for the route's own date*:
    // the redirect keeps `date=` instead of dropping the manager on a board defaulted to
    // today, and the board's own GET /routes carries both filters from the query string.
    expect(await screen.findByRole("row", { name: /João da Silva/ })).toBeInTheDocument();
    const boardQuery = fakeFetch.mock.calls
      .map(([input]) => (input instanceof Request ? input.url : String(input)))
      .find((url) => url.includes("/routes") && url.includes("route_type=OCCASIONAL"));
    expect(boardQuery).toBeDefined();
    expect(boardQuery).toContain("date=2026-09-01");
  });

  it("locks the single-worker select and omits field_worker_id from the PATCH in edit mode even with ?type=OCCASIONAL", async () => {
    const routeBody = {
      ...EMPTY_ROUTE,
      id: "r5",
      stops: [
        {
          id: "s1",
          order_index: 1,
          status: "PENDING",
          service_point_id: "sp1",
          service_point_name: "Sala 101",
          expected_arrival_from: null,
          expected_arrival_to: null,
        },
      ],
    };
    const fakeFetch = makeFakeFetch({ routeBody });
    const user = userEvent.setup();
    renderBuilder("/rotas/r5/editar?type=OCCASIONAL", fakeFetch);

    await screen.findByText("Sala 101");
    // Still the single-worker <select> (not the occasional multi-checkbox), but disabled:
    // reassignment goes through the board's reassign dialog, and the backend 409s a PATCH
    // that changes the worker.
    const workerSelect = screen.getByRole("combobox", { name: "Profissional" });
    expect(workerSelect).toBeDisabled();
    expect(workerSelect).toHaveValue("w1");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getByText("Para reatribuir a rota, use o menu de ações no quadro de rotas."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const patchCall = await findWriteCall(fakeFetch, "PATCH");
    expect((patchCall[0] as Request).url).toContain("/routes/r5");
    const body = (await (patchCall[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("field_worker_id");
    expect(body).toEqual({
      route_date: "2026-09-01",
      stops: [{ service_point_id: "sp1", expected_arrival_from: null, expected_arrival_to: null }],
    });
  });

  it("keeps submit disabled in occasional mode until a worker and a stop are added", async () => {
    const fakeFetch = makeFakeFetch();
    const user = userEvent.setup();
    renderBuilder("/rotas/nova?type=OCCASIONAL", fakeFetch);

    expect(await screen.findByRole("button", { name: "Salvar" })).toBeDisabled();

    await user.click(await screen.findByRole("checkbox", { name: "João da Silva" }));
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();

    await pickBuildingFloor(user);
    await addPoint(user, "sp1");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });
});
