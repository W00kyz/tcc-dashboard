import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BoardSnapshot } from "@/api/monitoringStream";
import { AuthProvider } from "@/auth/AuthContext";
import { RouteBoardPage } from "@/routes/RouteBoardPage";

// The SSE hook is exercised on its own in monitoringStream.test.ts; here we drive the page
// with a hand-set stream state so the board's KPIs / alert panel / fallback branch can be
// asserted without a live connection.
let boardStreamState: { snapshot: BoardSnapshot | null; fallback: boolean } = {
  snapshot: null,
  fallback: false,
};

vi.mock("@/api/monitoringStream", () => ({
  useBoardStream: () => boardStreamState,
}));

afterEach(() => {
  boardStreamState = { snapshot: null, fallback: false };
});

type BoardAlert = BoardSnapshot["open_alerts"][number];

function snapshot(patch: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    generated_at: "2026-10-20T12:00:00Z",
    service_day: true,
    routes: [],
    pool: [],
    not_started: [],
    released_today: 0,
    open_alerts: [],
    worker_positions: [],
    ...patch,
  };
}

function alert(id: string, description: string, patch: Partial<BoardAlert> = {}): BoardAlert {
  return {
    id,
    kind: "BATCH_RELEASED",
    severity: "WARNING",
    description,
    route_id: "r1",
    route_stop_id: null,
    field_worker_id: "w1",
    status: "OPEN",
    created_at: "2026-10-20T11:00:00Z",
    ...patch,
  };
}

function stop(
  id: string,
  orderIndex: number,
  batchNumber: number,
  status: string,
  releaseReason: string | null = null,
) {
  return {
    id,
    order_index: orderIndex,
    batch_number: batchNumber,
    status,
    release_reason: releaseReason,
    service_point_id: `p-${id}`,
    service_point_name: `Sala ${String(orderIndex)}`,
  };
}

// João is on his second batch: two points of the first one done, one of the second running.
const RUNNING_ROUTE = {
  id: "r1",
  field_worker_id: "w1",
  field_worker_name: "João da Silva",
  route_date: "2026-10-20",
  status: "IN_PROGRESS",
  started_at: "2026-10-20T08:00:00Z",
  routing_degraded: false,
  current_batch: 2,
  stops: [
    stop("s1", 1, 1, "DONE"),
    stop("s2", 2, 1, "DONE"),
    stop("s3", 3, 2, "IN_PROGRESS"),
    stop("s4", 4, 2, "PENDING"),
  ],
};

// Maria left the campus: her batch went back to the pool.
const PAUSED_ROUTE = {
  id: "r2",
  field_worker_id: "w2",
  field_worker_name: "Maria Souza",
  route_date: "2026-10-20",
  status: "PAUSED",
  started_at: "2026-10-20T08:00:00Z",
  routing_degraded: false,
  current_batch: 1,
  stops: [stop("s5", 1, 1, "DONE"), stop("s6", 2, 1, "RELEASED", "LEFT_CAMPUS")],
};

const WORKERS = [
  { id: "w1", full_name: "João da Silva", contractor_company_id: "c1" },
  { id: "w2", full_name: "Maria Souza", contractor_company_id: "c2" },
].map((worker) => ({
  ...worker,
  email: "x@ufcg.edu.br",
  contractor_company_name: worker.contractor_company_id === "c1" ? "Limpa Tudo" : "Jardins",
  status: "APPROVED",
  is_active: true,
  rejection_reason: null,
  created_at: "2026-10-01T00:00:00Z",
  done_today: 0,
}));

const COMPANIES = [
  { id: "c1", name: "Limpa Tudo", cnpj: "00.000.000/0001-00", service_types: [] },
  { id: "c2", name: "Jardins", cnpj: "00.000.000/0002-00", service_types: [] },
];

const BUILDING = {
  id: "b1",
  name: "Bloco CD",
  campus_area: "CEEI",
  footprint: {
    type: "Polygon",
    coordinates: [
      [
        [-35.9, -7.21],
        [-35.899, -7.21],
        [-35.899, -7.209],
        [-35.9, -7.209],
        [-35.9, -7.21],
      ],
    ],
  },
};
const FLOOR = { id: "f0", building_id: "b1", label: "Térreo" };
const POINT = {
  id: "p1",
  floor_id: "f0",
  name: "Banheiro térreo",
  description: "",
  latitude: -7.2095,
  longitude: -35.8995,
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function makeFakeFetch(routes: unknown[] = [RUNNING_ROUTE, PAUSED_ROUTE], board = snapshot()) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    const reply = (body: unknown) =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    if (url.includes("/field-workers")) {
      return reply(WORKERS);
    }
    if (url.includes("/contractor-companies")) {
      return reply(COMPANIES);
    }
    if (url.includes("/monitoring/board")) {
      return reply(board);
    }
    if (url.includes("/buildings")) {
      return reply([BUILDING]);
    }
    if (url.includes("/floors")) {
      return reply([FLOOR]);
    }
    if (url.includes("/service-points")) {
      return reply([POINT]);
    }
    if (url.includes("/alerts/")) {
      return reply({ id: "a1" });
    }

    return reply(routes);
  });
}

function renderPage(fetchImpl: typeof fetch, path = "/rotas") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouteBoardPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function routeListQueries(fakeFetch: ReturnType<typeof makeFakeFetch>): string[] {
  return fakeFetch.mock.calls
    .map(([input]) => requestUrl(input))
    .filter((url) => url.includes("/routes"));
}

describe("RouteBoardPage", () => {
  it("only follows the day: no route creation, no route actions, no route-type filter", async () => {
    renderPage(makeFakeFetch());

    const row = await screen.findByRole("row", { name: /João da Silva/ });
    expect(screen.queryByRole("button", { name: "Nova rota" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova rota eventual" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("group", { name: "Ações da rota" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo")).not.toBeInTheDocument();
  });

  it("shows worker, company, status, the current batch and the points done today", async () => {
    renderPage(makeFakeFetch());

    const row = await screen.findByRole("row", { name: /João da Silva/ });
    expect(within(row).getByText("Limpa Tudo")).toBeInTheDocument();
    expect(within(row).getByText("Em andamento")).toBeInTheDocument();
    // Only the stops of batch 2 make up the strip; batch 1 is history.
    expect(within(row).getByLabelText("Ponto 3: Em andamento")).toBeInTheDocument();
    expect(within(row).getByLabelText("Ponto 4: Pendente")).toBeInTheDocument();
    expect(within(row).queryByLabelText("Ponto 1: Concluído")).not.toBeInTheDocument();
    expect(within(row).getByRole("cell", { name: /Feitos hoje:\s*2/ })).toBeInTheDocument();
  });

  it("greys a released stop and tells why it went back to the pool", async () => {
    renderPage(makeFakeFetch());

    const row = await screen.findByRole("row", { name: /Maria Souza/ });
    expect(within(row).getByText("Pausada")).toBeInTheDocument();
    const released = within(row).getByLabelText("Ponto 2: Liberado — Saiu do campus");
    expect(released).toHaveAttribute("title", "Liberado — Saiu do campus");
  });

  it("filters by route status with the three automatic-allocation states", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);
    await screen.findByRole("row", { name: /João da Silva/ });

    const status = screen.getByLabelText("Situação");
    const options = within(status)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Todas", "Em andamento", "Pausada", "Concluída"]);

    fireEvent.change(status, { target: { value: "PAUSED" } });

    await waitFor(() => {
      expect(routeListQueries(fakeFetch).some((url) => url.includes("status=PAUSED"))).toBe(true);
    });
  });

  it("pushes the chosen date into the /routes query string", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);
    await screen.findByRole("row", { name: /João da Silva/ });

    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-01-15" } });

    await waitFor(() => {
      expect(routeListQueries(fakeFetch).some((url) => url.includes("date=2026-01-15"))).toBe(true);
    });
  });

  it("omits the date param entirely when the date input is cleared", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);
    await screen.findByRole("row", { name: /João da Silva/ });
    const callsBefore = fakeFetch.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "" } });

    await waitFor(() => {
      const routeCallsAfterClear = fakeFetch.mock.calls
        .slice(callsBefore)
        .map(([input]) => requestUrl(input))
        .filter((url) => url.includes("/routes"));
      expect(routeCallsAfterClear.length).toBeGreaterThan(0);
      expect(routeCallsAfterClear.every((url) => !/[?&]date=/.test(url))).toBe(true);
    });
  });

  it("pre-applies the status filter from the query string", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch, "/rotas?status=DONE");
    await screen.findByRole("row", { name: /João da Silva/ });

    expect(screen.getByLabelText("Situação")).toHaveValue("DONE");
    await waitFor(() => {
      expect(routeListQueries(fakeFetch).some((url) => url.includes("status=DONE"))).toBe(true);
    });
  });

  it("lists the open alerts, a route-less one included, and acknowledges one", async () => {
    boardStreamState = {
      fallback: false,
      snapshot: snapshot({
        routes: [
          {
            route_id: "r1",
            field_worker_id: "w1",
            field_worker_name: "João da Silva",
            company_name: "Limpa Tudo",
            route_date: "2026-10-20",
            status: "IN_PROGRESS",
            open_alert_count: 2,
            current_batch: 2,
            stops: [],
            done_today: 2,
          },
        ],
        open_alerts: [
          alert("a1", "Lote de João liberado: saiu do campus"),
          alert("a2", "3 pontos não atendidos hoje", {
            kind: "POINTS_UNSERVED",
            route_id: null,
            field_worker_id: null,
          }),
        ],
      }),
    };
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const row = await screen.findByRole("row", { name: /João da Silva/ });
    expect(within(row).getByText("2 alertas abertos")).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "3 pontos não atendidos hoje" }),
    ).toBeInTheDocument();

    const released = screen.getByRole("listitem", {
      name: "Lote de João liberado: saiu do campus",
    });
    fireEvent.click(within(released).getByRole("button", { name: "Reconhecer" }));

    await waitFor(() => {
      expect(
        fakeFetch.mock.calls.some(([input]) =>
          requestUrl(input).includes("/alerts/a1/acknowledge"),
        ),
      ).toBe(true);
    });
  });

  it("shows the polled board (not the stale stream frame) once in fallback mode", async () => {
    boardStreamState = {
      snapshot: snapshot({ open_alerts: [alert("stale", "Alerta antigo do stream morto")] }),
      fallback: true,
    };
    renderPage(
      makeFakeFetch(
        [RUNNING_ROUTE],
        snapshot({ open_alerts: [alert("fresh", "Alerta novo do poll")] }),
      ),
    );

    expect(await screen.findByText("Alerta novo do poll")).toBeInTheDocument();
    expect(screen.queryByText("Alerta antigo do stream morto")).not.toBeInTheDocument();
  });

  it("renders an acknowledged alert without a working acknowledge button", async () => {
    boardStreamState = {
      fallback: false,
      snapshot: snapshot({
        open_alerts: [alert("ack1", "Alerta já reconhecido", { status: "ACKNOWLEDGED" })],
      }),
    };
    renderPage(makeFakeFetch());

    const item = await screen.findByRole("listitem", { name: "Alerta já reconhecido" });
    expect(within(item).getByText("Reconhecido")).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: "Reconhecer" })).not.toBeInTheDocument();
    expect(within(item).getByRole("button", { name: "Resolver" })).toBeInTheDocument();
  });

  it("polls GET /monitoring/board when the stream has fallen back to polling", async () => {
    boardStreamState = { snapshot: null, fallback: true };
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);
    await screen.findByRole("row", { name: /João da Silva/ });

    await waitFor(() => {
      expect(
        fakeFetch.mock.calls.some(([input]) => requestUrl(input).includes("/monitoring/board")),
      ).toBe(true);
    });
  });

  it("refetches the route list when a route's live state changes in the snapshot", async () => {
    const boardRoute = {
      route_id: "r1",
      field_worker_id: "w1",
      field_worker_name: "João da Silva",
      company_name: "Limpa Tudo",
      route_date: "2026-10-20",
      status: "IN_PROGRESS",
      open_alert_count: 0,
      current_batch: 2,
      stops: [],
      done_today: 2,
    };
    boardStreamState = { fallback: false, snapshot: snapshot({ routes: [boardRoute] }) };
    const fakeFetch = makeFakeFetch();
    vi.stubGlobal("fetch", fakeFetch);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (nonce: number) => (
      <MemoryRouter initialEntries={["/rotas"]}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <div data-nonce={nonce}>
              <RouteBoardPage />
            </div>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
    const { rerender } = render(tree(0));

    await screen.findByRole("row", { name: /João da Silva/ });
    await waitFor(() => {
      expect(routeListQueries(fakeFetch).length).toBeGreaterThan(0);
    });
    const before = routeListQueries(fakeFetch).length;

    // Same route id set, but a point of the batch was just done.
    boardStreamState = {
      fallback: false,
      snapshot: snapshot({ routes: [{ ...boardRoute, done_today: 3 }] }),
    };
    rerender(tree(1));

    await waitFor(() => {
      expect(routeListQueries(fakeFetch).length).toBeGreaterThan(before);
    });
  });

  it("says '1 livre', not '1 livres', when one point of a type is free", async () => {
    boardStreamState = {
      fallback: false,
      snapshot: snapshot({
        pool: [
          {
            service_type_id: "t1",
            service_type_name: "Limpeza de banheiro",
            company_name: "Limpa Tudo",
            total: 2,
            done: 0,
            in_progress: 1,
            free: 1,
          },
        ],
      }),
    };
    renderPage(makeFakeFetch());

    const kpis = await screen.findByRole("region", { name: "Indicadores do dia" });
    const pool = within(kpis).getByRole("group", { name: /Limpeza de banheiro/ });
    expect(pool).toHaveTextContent("1 em andamento · 1 livre");
    expect(pool).not.toHaveTextContent("1 livres");
  });

  it("summarises the pool per service type, workers on route and today's releases", async () => {
    boardStreamState = {
      fallback: false,
      snapshot: snapshot({
        routes: [
          {
            route_id: "r1",
            field_worker_id: "w1",
            field_worker_name: "João da Silva",
            company_name: "Limpa Tudo",
            route_date: "2026-10-20",
            status: "IN_PROGRESS",
            open_alert_count: 0,
            current_batch: 2,
            stops: [],
            done_today: 2,
          },
        ],
        pool: [
          {
            service_type_id: "t1",
            service_type_name: "Limpeza de banheiro",
            company_name: "Limpa Tudo",
            total: 12,
            done: 5,
            in_progress: 2,
            free: 5,
          },
        ],
        released_today: 3,
      }),
    };
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const kpis = await screen.findByRole("region", { name: "Indicadores do dia" });
    const pool = within(kpis).getByRole("group", { name: /Limpeza de banheiro/ });
    expect(pool).toHaveTextContent("5 / 12");
    expect(pool).toHaveTextContent("2 em andamento");
    expect(pool).toHaveTextContent("5 livres");
    expect(within(kpis).getByRole("button", { name: /Profissionais em rota/ })).toHaveTextContent(
      "1",
    );
    expect(within(kpis).getByRole("group", { name: /Liberações hoje/ })).toHaveTextContent("3");

    fireEvent.click(within(kpis).getByRole("button", { name: /Profissionais em rota/ }));

    await waitFor(() => {
      expect(routeListQueries(fakeFetch).some((url) => url.includes("status=IN_PROGRESS"))).toBe(
        true,
      );
    });
  });

  it("lists the approved workers who have not started today", async () => {
    boardStreamState = {
      fallback: false,
      snapshot: snapshot({
        not_started: [{ id: "w9", full_name: "Pedro Lima", company_name: "Jardins" }],
      }),
    };
    renderPage(makeFakeFetch());

    const block = await screen.findByRole("region", { name: "Ainda não iniciaram hoje" });
    expect(within(block).getByRole("listitem")).toHaveTextContent("Pedro Lima");
    expect(within(block).getByRole("listitem")).toHaveTextContent("Jardins");
  });

  it("says when today is not a service day", async () => {
    boardStreamState = { fallback: false, snapshot: snapshot({ service_day: false }) };
    renderPage(makeFakeFetch());

    expect(await screen.findByText("Hoje não é dia de serviço")).toBeInTheDocument();
  });

  it("keeps the banner away on a service day", async () => {
    boardStreamState = { fallback: false, snapshot: snapshot() };
    renderPage(makeFakeFetch());

    await screen.findByRole("row", { name: /João da Silva/ });
    expect(screen.queryByText("Hoje não é dia de serviço")).not.toBeInTheDocument();
  });

  it("puts paused routes first, filters by company and by name", async () => {
    renderPage(makeFakeFetch());

    const table = await screen.findByRole("table", { name: "Rotas" });
    await within(table).findByRole("row", { name: /Maria Souza/ });
    const [, firstRouteRow] = within(table).getAllByRole("row");
    expect(firstRouteRow).toHaveTextContent("Maria Souza");

    fireEvent.change(screen.getByLabelText("Empresa"), { target: { value: "c1" } });
    expect(await screen.findByRole("row", { name: /João da Silva/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Maria Souza/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Empresa"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Profissional"), { target: { value: "maria" } });
    expect(await screen.findByRole("row", { name: /Maria Souza/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /João da Silva/ })).not.toBeInTheDocument();
  });

  it("pages the route table ten rows at a time and starts over when a filter changes", async () => {
    const manyRoutes = Array.from({ length: 12 }, (_, index) => ({
      ...RUNNING_ROUTE,
      id: `p${String(index)}`,
      field_worker_name: `Profissional ${String(index).padStart(2, "0")}`,
    }));
    renderPage(makeFakeFetch(manyRoutes));

    const pager = await screen.findByRole("navigation", { name: "Paginação das rotas" });
    expect(pager).toHaveTextContent("Mostrando 1–10 de 12 rotas");
    expect(screen.getByRole("row", { name: /Profissional 09/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Profissional 10/ })).not.toBeInTheDocument();

    fireEvent.click(within(pager).getByRole("button", { name: /Próxima/ }));

    expect(pager).toHaveTextContent("Mostrando 11–12 de 12 rotas");
    expect(screen.getByRole("row", { name: /Profissional 11/ })).toBeInTheDocument();
    expect(within(pager).getByRole("button", { name: /Próxima/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "IN_PROGRESS" } });

    // The table reloads for the new filter, so look the pager up again.
    expect(
      await screen.findByText("Mostrando 1–10 de 12 rotas", undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("opens the building panel from the map and returns to the alerts", async () => {
    renderPage(makeFakeFetch());
    await screen.findByRole("row", { name: /João da Silva/ });

    // Leaflet draws the outline as an SVG path that has no role; the map region is the closest
    // accessible handle, as in the worker marker click test.
    const region = screen.getByRole("region", { name: /mapa das posições/i });
    const outline = await waitFor(() => {
      const found = region.querySelector(".leaflet-interactive");
      if (found === null) {
        throw new Error("expected the building outline on the map; found none.");
      }

      return found;
    });
    fireEvent.click(outline);

    expect(await screen.findByRole("heading", { name: "Bloco CD" })).toBeInTheDocument();
    expect(await screen.findByRole("listitem", { name: /Banheiro térreo/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Alertas abertos" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Voltar aos alertas" }));

    expect(await screen.findByRole("heading", { name: "Alertas abertos" })).toBeInTheDocument();
  });
});
