import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BoardSnapshot } from "@/api/monitoringStream";
import { AuthProvider } from "@/auth/AuthContext";
import { RouteBoardPage } from "@/routes/RouteBoardPage";

// The SSE hook is exercised on its own in monitoringStream.test.ts; here we drive the page
// with a hand-set stream state so the board's delay flags / alert panel / fallback branch
// can be asserted without a live connection.
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

const EMPTY_SNAPSHOT: BoardSnapshot = {
  generated_at: "2026-08-31T12:00:00Z",
  routes: [],
  open_alerts: [],
  worker_positions: [],
};

const OCCASIONAL_ROUTE = {
  id: "r1",
  field_worker_id: "w1",
  field_worker_name: "João da Silva",
  route_date: "2026-08-31",
  route_type: "OCCASIONAL",
  status: "PLANNED",
  scheduled_start_at: null,
  started_at: null,
  routing_degraded: false,
  stops: [
    { id: "s1", order_index: 1, status: "IN_PROGRESS", service_point_name: "Sala 101" },
    { id: "s2", order_index: 2, status: "PENDING", service_point_name: "Sala 102" },
  ],
};

const CANCELLED_ROUTE = {
  id: "r2",
  field_worker_id: "w2",
  field_worker_name: "Maria Souza",
  route_date: "2026-08-31",
  route_type: "REGULAR",
  status: "CANCELLED",
  scheduled_start_at: null,
  started_at: null,
  routing_degraded: false,
  stops: [],
};

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

const COMPANIES = [{ id: "c1", name: "Limpa Tudo", cnpj: "00.000.000/0001-00" }];

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
  point_type: "FIXED",
  event_id: null,
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function makeFakeFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.includes("/field-workers")) {
      return Promise.resolve(new Response(JSON.stringify(WORKERS), { status: 200 }));
    }
    if (url.includes("/contractor-companies")) {
      return Promise.resolve(new Response(JSON.stringify(COMPANIES), { status: 200 }));
    }
    if (url.includes("/monitoring/board")) {
      return Promise.resolve(new Response(JSON.stringify(EMPTY_SNAPSHOT), { status: 200 }));
    }
    if (url.includes("/buildings")) {
      return Promise.resolve(new Response(JSON.stringify([BUILDING]), { status: 200 }));
    }
    if (url.includes("/floors")) {
      return Promise.resolve(new Response(JSON.stringify([FLOOR]), { status: 200 }));
    }
    if (url.includes("/service-points")) {
      return Promise.resolve(new Response(JSON.stringify([POINT]), { status: 200 }));
    }
    if (url.includes("/alerts/")) {
      return Promise.resolve(new Response(JSON.stringify({ id: "a1" }), { status: 200 }));
    }

    return Promise.resolve(
      new Response(JSON.stringify([OCCASIONAL_ROUTE, CANCELLED_ROUTE]), { status: 200 }),
    );
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
  it("shows the EVENTUAL badge only on the occasional route", async () => {
    renderPage(makeFakeFetch());

    const occasionalCard = await screen.findByRole("row", { name: /João da Silva/ });
    expect(within(occasionalCard).getByText("Eventual")).toBeInTheDocument();

    const regularCard = screen.getByRole("row", { name: /Maria Souza/ });
    expect(within(regularCard).queryByText("Eventual")).not.toBeInTheDocument();
  });

  it("renders the cancelled pill on the cancelled route", async () => {
    renderPage(makeFakeFetch());

    const cancelledCard = await screen.findByRole("row", { name: /Maria Souza/ });
    expect(within(cancelledCard).getByText("Cancelada")).toBeInTheDocument();
  });

  it("renders the amber in-progress dot for an IN_PROGRESS stop", async () => {
    renderPage(makeFakeFetch());

    const occasionalCard = await screen.findByRole("row", { name: /João da Silva/ });
    expect(within(occasionalCard).getByLabelText("Ponto 1: Em andamento")).toBeInTheDocument();
  });

  it("renders the route actions menu inside each card", async () => {
    renderPage(makeFakeFetch());

    const occasionalCard = await screen.findByRole("row", { name: /João da Silva/ });
    const actions = within(occasionalCard).getByRole("group", { name: "Ações da rota" });
    expect(within(actions).getByRole("link", { name: "Editar" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Mais ações da rota" })).toBeInTheDocument();
  });

  it("pushes the chosen date into the /routes query string", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    await screen.findByRole("row", { name: /João da Silva/ });

    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-01-15" } });

    await waitFor(() => {
      const hit = fakeFetch.mock.calls.some(([input]) =>
        requestUrl(input).includes("date=2026-01-15"),
      );
      expect(hit).toBe(true);
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

  it("pre-applies the type filter from the query string", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch, "/rotas?route_type=OCCASIONAL");

    await screen.findByRole("row", { name: /João da Silva/ });

    expect(screen.getByLabelText("Tipo")).toHaveValue("OCCASIONAL");
    await waitFor(() => {
      expect(routeListQueries(fakeFetch).some((url) => url.includes("route_type=OCCASIONAL"))).toBe(
        true,
      );
    });
    expect(routeListQueries(fakeFetch).every((url) => !url.includes("route_type=REGULAR"))).toBe(
      true,
    );
  });

  it("writes a filter change back to the query string", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    await screen.findByRole("row", { name: /João da Silva/ });
    fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "CANCELLED" } });

    await waitFor(() => {
      expect(routeListQueries(fakeFetch).some((url) => url.includes("status=CANCELLED"))).toBe(
        true,
      );
    });
  });

  it("marks a delayed route and lists its open alert in the panel", async () => {
    boardStreamState = {
      fallback: false,
      snapshot: {
        generated_at: "2026-08-31T12:00:00Z",
        routes: [
          {
            route_id: "r1",
            field_worker_id: "w1",
            field_worker_name: "João da Silva",
            route_date: "2026-08-31",
            status: "IN_PROGRESS",
            is_delayed: true,
            open_alert_count: 2,
            stop_total: 2,
            stop_done: 0,
          },
        ],
        open_alerts: [
          {
            id: "a1",
            kind: "LATE_STOP",
            severity: "WARNING",
            description: "Ponto atrasado na rota de João",
            route_id: "r1",
            route_stop_id: "s1",
            field_worker_id: "w1",
            status: "OPEN",
            created_at: "2026-08-31T11:00:00Z",
          },
        ],
        worker_positions: [],
      },
    };
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const occasionalCard = await screen.findByRole("row", { name: /João da Silva/ });
    expect(within(occasionalCard).getByText("Atrasada")).toBeInTheDocument();
    expect(within(occasionalCard).getByText("2 alertas abertos")).toBeInTheDocument();

    const alert = screen.getByRole("listitem", { name: "Ponto atrasado na rota de João" });
    expect(within(alert).getByText("Ponto atrasado na rota de João")).toBeInTheDocument();

    fireEvent.click(within(alert).getByRole("button", { name: "Reconhecer" }));

    await waitFor(() => {
      const hit = fakeFetch.mock.calls.some(([input]) =>
        requestUrl(input).includes("/alerts/a1/acknowledge"),
      );
      expect(hit).toBe(true);
    });
  });

  it("shows the polled board (not the stale stream frame) once in fallback mode", async () => {
    const staleSnapshot: BoardSnapshot = {
      generated_at: "2026-08-31T11:00:00Z",
      routes: [],
      open_alerts: [
        {
          id: "stale",
          kind: "LATE_STOP",
          severity: "WARNING",
          description: "Alerta antigo do stream morto",
          route_id: "r1",
          route_stop_id: "s1",
          field_worker_id: "w1",
          status: "OPEN",
          created_at: "2026-08-31T10:00:00Z",
        },
      ],
      worker_positions: [],
    };
    const freshSnapshot: BoardSnapshot = {
      generated_at: "2026-08-31T12:00:00Z",
      routes: [],
      open_alerts: [
        {
          id: "fresh",
          kind: "LATE_STOP",
          severity: "WARNING",
          description: "Alerta novo do poll",
          route_id: "r1",
          route_stop_id: "s1",
          field_worker_id: "w1",
          status: "OPEN",
          created_at: "2026-08-31T11:59:00Z",
        },
      ],
      worker_positions: [],
    };
    boardStreamState = { snapshot: staleSnapshot, fallback: true };
    const fakeFetch = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/field-workers")) {
        return Promise.resolve(new Response(JSON.stringify(WORKERS), { status: 200 }));
      }
      if (url.includes("/monitoring/board")) {
        return Promise.resolve(new Response(JSON.stringify(freshSnapshot), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify([OCCASIONAL_ROUTE]), { status: 200 }));
    });
    renderPage(fakeFetch);

    expect(await screen.findByText("Alerta novo do poll")).toBeInTheDocument();
    expect(screen.queryByText("Alerta antigo do stream morto")).not.toBeInTheDocument();
  });

  it("renders an acknowledged alert without a working acknowledge button", async () => {
    boardStreamState = {
      fallback: false,
      snapshot: {
        generated_at: "2026-08-31T12:00:00Z",
        routes: [],
        open_alerts: [
          {
            id: "ack1",
            kind: "LATE_STOP",
            severity: "WARNING",
            description: "Alerta já reconhecido",
            route_id: "r1",
            route_stop_id: "s1",
            field_worker_id: "w1",
            status: "ACKNOWLEDGED",
            created_at: "2026-08-31T11:00:00Z",
          },
        ],
        worker_positions: [],
      },
    };
    renderPage(makeFakeFetch());

    const alert = await screen.findByRole("listitem", { name: "Alerta já reconhecido" });
    expect(within(alert).getByText("Reconhecido")).toBeInTheDocument();
    expect(within(alert).queryByRole("button", { name: "Reconhecer" })).not.toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Resolver" })).toBeInTheDocument();
  });

  it("polls GET /monitoring/board when the stream has fallen back to polling", async () => {
    boardStreamState = { snapshot: null, fallback: true };
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    await screen.findByRole("row", { name: /João da Silva/ });

    await waitFor(() => {
      const hit = fakeFetch.mock.calls.some(([input]) =>
        requestUrl(input).includes("/monitoring/board"),
      );
      expect(hit).toBe(true);
    });
  });

  it("refetches the route list when a route's in-place status changes in the snapshot", async () => {
    const boardRoute = {
      route_id: "r1",
      field_worker_id: "w1",
      field_worker_name: "João da Silva",
      route_date: "2026-08-31",
      status: "PLANNED",
      is_delayed: false,
      open_alert_count: 0,
      stop_total: 2,
      stop_done: 0,
    };
    const snapshotWith = (patch: Partial<typeof boardRoute>): BoardSnapshot => ({
      generated_at: "2026-08-31T12:00:00Z",
      routes: [{ ...boardRoute, ...patch }],
      open_alerts: [],
      worker_positions: [],
    });
    boardStreamState = { fallback: false, snapshot: snapshotWith({}) };

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

    // Same route id set, but the route moved PLANNED -> IN_PROGRESS and a stop completed.
    boardStreamState = {
      fallback: false,
      snapshot: snapshotWith({ status: "IN_PROGRESS", stop_done: 1 }),
    };
    rerender(tree(1));

    await waitFor(() => {
      expect(routeListQueries(fakeFetch).length).toBeGreaterThan(before);
    });
  });

  it("summarises the live day in the KPI strip and filters by in-progress routes", async () => {
    boardStreamState = {
      fallback: false,
      snapshot: {
        generated_at: "2026-08-31T12:00:00Z",
        routes: [
          {
            route_id: "r1",
            field_worker_id: "w1",
            field_worker_name: "João da Silva",
            route_date: "2026-08-31",
            status: "IN_PROGRESS",
            is_delayed: true,
            open_alert_count: 0,
            stop_total: 4,
            stop_done: 1,
          },
        ],
        open_alerts: [],
        worker_positions: [],
      },
    };
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const kpis = await screen.findByRole("region", { name: "Indicadores do dia" });
    expect(within(kpis).getByText("Atrasadas").parentElement).toHaveTextContent(
      "Precisam de atenção agora",
    );
    // Route and stop counts come from the day's route list (an open route with 2 stops and a
    // cancelled one), not from the live board, which never carries finished routes.
    expect(await within(kpis).findByText("0 de 2 pontos")).toBeInTheDocument();
    expect(within(kpis).getByText(/1 cancelada/)).toBeInTheDocument();

    fireEvent.click(within(kpis).getByRole("button", { name: /Em andamento/ }));

    await waitFor(() => {
      expect(routeListQueries(fakeFetch).some((url) => url.includes("status=IN_PROGRESS"))).toBe(
        true,
      );
    });
  });

  it("groups routes by company, puts the delayed one first and filters by name", async () => {
    boardStreamState = {
      fallback: false,
      snapshot: {
        generated_at: "2026-08-31T12:00:00Z",
        routes: [
          {
            route_id: "r2",
            field_worker_id: "w2",
            field_worker_name: "Maria Souza",
            route_date: "2026-08-31",
            status: "CANCELLED",
            is_delayed: true,
            open_alert_count: 0,
            stop_total: 0,
            stop_done: 0,
          },
        ],
        open_alerts: [],
        worker_positions: [],
      },
    };
    renderPage(makeFakeFetch());

    const group = await screen.findByRole("rowgroup", { name: "Limpa Tudo" });
    expect(within(group).getByRole("button", { name: /Limpa Tudo/ })).toHaveTextContent("2 rotas");
    // The group's first row is its heading; the delayed route leads the rows after it.
    const [, firstRouteRow] = within(group).getAllByRole("row");
    expect(firstRouteRow).toHaveTextContent("Maria Souza");

    fireEvent.change(screen.getByLabelText("Profissional"), { target: { value: "joao" } });

    expect(await screen.findByRole("row", { name: /João da Silva/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Maria Souza/ })).not.toBeInTheDocument();
  });

  it("pages the route table ten rows at a time and starts over when a filter changes", async () => {
    const manyRoutes = Array.from({ length: 12 }, (_, index) => ({
      ...OCCASIONAL_ROUTE,
      id: `p${String(index)}`,
      field_worker_name: `Profissional ${String(index).padStart(2, "0")}`,
    }));
    const fakeFetch = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/field-workers")) {
        return Promise.resolve(new Response(JSON.stringify(WORKERS), { status: 200 }));
      }
      if (url.includes("/contractor-companies")) {
        return Promise.resolve(new Response(JSON.stringify(COMPANIES), { status: 200 }));
      }
      if (url.includes("/monitoring/board")) {
        return Promise.resolve(new Response(JSON.stringify(EMPTY_SNAPSHOT), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify(manyRoutes), { status: 200 }));
    });
    renderPage(fakeFetch);

    const pager = await screen.findByRole("navigation", { name: "Paginação das rotas" });
    expect(pager).toHaveTextContent("Mostrando 1–10 de 12 rotas");
    expect(screen.getByRole("row", { name: /Profissional 09/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Profissional 10/ })).not.toBeInTheDocument();

    fireEvent.click(within(pager).getByRole("button", { name: /Próxima/ }));

    expect(pager).toHaveTextContent("Mostrando 11–12 de 12 rotas");
    expect(screen.getByRole("row", { name: /Profissional 11/ })).toBeInTheDocument();
    expect(within(pager).getByRole("button", { name: /Próxima/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "OCCASIONAL" } });

    // The table reloads for the new filter, so look the pager up again.
    expect(
      await screen.findByText("Mostrando 1–10 de 12 rotas", undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("links to the new-route pages with the right route_type", async () => {
    renderPage(makeFakeFetch());

    await screen.findByRole("row", { name: /João da Silva/ });

    expect(screen.getByRole("link", { name: "Nova rota" })).toHaveAttribute(
      "href",
      "/rotas/nova?type=REGULAR",
    );
    expect(screen.getByRole("link", { name: "Nova rota eventual" })).toHaveAttribute(
      "href",
      "/rotas/nova?type=OCCASIONAL",
    );
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
