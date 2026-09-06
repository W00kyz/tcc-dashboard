import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ReassignmentsPage } from "@/routes/ReassignmentsPage";

const STOP_IMPEDIMENT = {
  id: "imp1",
  route_id: "r1",
  route_stop_id: "s2",
  scope: "STOP",
  reason: "ACCESS_BLOCKED",
  note: "Portão trancado",
  status: "PENDING",
  reported_at: "2026-09-06T12:30:00Z",
  received_at: "2026-09-06T12:31:00Z",
};

const REMAINDER_IMPEDIMENT = {
  id: "imp2",
  route_id: "r1",
  route_stop_id: null,
  scope: "ROUTE_REMAINDER",
  reason: "HEALTH_ISSUE",
  note: null,
  status: "PENDING",
  reported_at: "2026-09-06T09:00:00Z",
  received_at: "2026-09-06T09:01:00Z",
};

const ROUTE = {
  id: "r1",
  field_worker_id: "w1",
  field_worker_name: "João da Silva",
  route_date: "2026-09-06",
  route_type: "REGULAR",
  status: "IN_PROGRESS",
  scheduled_start_at: null,
  started_at: null,
  routing_degraded: false,
  stops: [
    {
      id: "s1",
      order_index: 1,
      status: "DONE",
      service_point_name: "Sala 101",
      building_name: "Bloco A",
    },
    {
      id: "s2",
      order_index: 2,
      status: "PENDING",
      service_point_name: "Sala 102",
      building_name: "Bloco A",
    },
    {
      id: "s3",
      order_index: 3,
      status: "PENDING",
      service_point_name: "Sala 103",
      building_name: "Bloco A",
    },
  ],
};

const CANDIDATES = [
  { field_worker_id: "w2", full_name: "Maria Souza", distance_m: 320, pending_stop_count: 2 },
  { field_worker_id: "w3", full_name: "Carlos Lima", distance_m: 1500, pending_stop_count: 5 },
];

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) {
    return init.method;
  }

  return input instanceof Request ? input.method : "GET";
}

function makeFakeFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";

    if (url.includes("/impediments") && url.includes("/candidates")) {
      return Promise.resolve(new Response(JSON.stringify(CANDIDATES), { status: 200 }));
    }
    if (url.includes("/reassign") || url.includes("/dismiss")) {
      return Promise.resolve(new Response(JSON.stringify(STOP_IMPEDIMENT), { status: 200 }));
    }
    if (url.includes("/impediments")) {
      return Promise.resolve(
        new Response(JSON.stringify([STOP_IMPEDIMENT, REMAINDER_IMPEDIMENT]), { status: 200 }),
      );
    }
    if (url.includes("/routes/")) {
      return Promise.resolve(new Response(JSON.stringify(ROUTE), { status: 200 }));
    }

    return Promise.resolve(new Response(JSON.stringify({ method }), { status: 200 }));
  });
}

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <MemoryRouter initialEntries={["/reatribuicoes"]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ReassignmentsPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ReassignmentsPage", () => {
  it("lists pending impediments with their translated reason and scope", async () => {
    renderPage(makeFakeFetch());

    const card = await screen.findByTestId("impediment-card-imp1");
    expect(within(card).getByText("Acesso bloqueado")).toBeInTheDocument();
    expect(within(card).getByText("Ponto específico")).toBeInTheDocument();

    const remainderCard = screen.getByTestId("impediment-card-imp2");
    expect(within(remainderCard).getByText("Restante da rota")).toBeInTheDocument();
  });

  it("names the affected stop for a STOP impediment and counts the rest for ROUTE_REMAINDER", async () => {
    renderPage(makeFakeFetch());

    const card = await screen.findByTestId("impediment-card-imp1");
    await within(card).findByText(/Sala 102 · Bloco A/);

    const remainderCard = screen.getByTestId("impediment-card-imp2");
    await within(remainderCard).findByText("2 pontos restantes na rota");
  });

  it("expands an impediment to show ranked candidates with distance and load", async () => {
    const user = userEvent.setup();
    renderPage(makeFakeFetch());

    const card = await screen.findByTestId("impediment-card-imp1");
    await user.click(within(card).getByRole("button", { name: "Ver candidatos" }));

    expect(await within(card).findByText("Maria Souza")).toBeInTheDocument();
    expect(within(card).getByText(/320 m/)).toBeInTheDocument();
    expect(within(card).getByText(/1\.5 km/)).toBeInTheDocument();
  });

  it("reassigns to a candidate after confirming the dialog", async () => {
    const user = userEvent.setup();
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const card = await screen.findByTestId("impediment-card-imp1");
    await user.click(within(card).getByRole("button", { name: "Ver candidatos" }));

    const rows = await within(card).findByText("Maria Souza");
    await user.click(
      within(rows.closest("li") as HTMLElement).getByRole("button", { name: "Reatribuir" }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Reatribuir" }));

    await waitFor(() => {
      const hit = fakeFetch.mock.calls.some(
        ([input, init]) =>
          requestUrl(input).includes("/impediments/imp1/reassign") &&
          requestMethod(input, init) === "POST",
      );
      expect(hit).toBe(true);
    });
  });

  it("dismisses an impediment without a confirmation dialog", async () => {
    const user = userEvent.setup();
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const card = await screen.findByTestId("impediment-card-imp1");
    await user.click(within(card).getByRole("button", { name: "Descartar" }));

    await waitFor(() => {
      const hit = fakeFetch.mock.calls.some(
        ([input, init]) =>
          requestUrl(input).includes("/impediments/imp1/dismiss") &&
          requestMethod(input, init) === "POST",
      );
      expect(hit).toBe(true);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
