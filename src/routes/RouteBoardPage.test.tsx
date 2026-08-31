import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { RouteBoardPage } from "@/routes/RouteBoardPage";

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
  stops: [{ id: "s1", order_index: 1, status: "PENDING", service_point_name: "Sala 101" }],
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

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function makeFakeFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    if (requestUrl(input).includes("/field-workers")) {
      return Promise.resolve(new Response(JSON.stringify(WORKERS), { status: 200 }));
    }

    return Promise.resolve(
      new Response(JSON.stringify([OCCASIONAL_ROUTE, CANCELLED_ROUTE]), { status: 200 }),
    );
  });
}

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouteBoardPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("RouteBoardPage", () => {
  it("shows the EVENTUAL badge only on the occasional route", async () => {
    renderPage(makeFakeFetch());

    const occasionalCard = await screen.findByTestId("route-card-r1");
    expect(within(occasionalCard).getByText("Eventual")).toBeInTheDocument();

    const regularCard = screen.getByTestId("route-card-r2");
    expect(within(regularCard).queryByText("Eventual")).not.toBeInTheDocument();
  });

  it("renders the cancelled pill on the cancelled route", async () => {
    renderPage(makeFakeFetch());

    const cancelledCard = await screen.findByTestId("route-card-r2");
    expect(within(cancelledCard).getByText("Cancelada")).toBeInTheDocument();
  });

  it("renders the route actions menu inside each card", async () => {
    renderPage(makeFakeFetch());

    const occasionalCard = await screen.findByTestId("route-card-r1");
    const actions = within(occasionalCard).getByTestId("route-actions");
    expect(within(actions).getByRole("button", { name: "Otimizar" })).toBeInTheDocument();
  });

  it("pushes the chosen date into the /routes query string", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    await screen.findByTestId("route-card-r1");

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

    await screen.findByTestId("route-card-r1");
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

  it("links to the new-route pages with the right route_type", async () => {
    renderPage(makeFakeFetch());

    await screen.findByTestId("route-card-r1");

    expect(screen.getByRole("link", { name: "Nova rota" })).toHaveAttribute(
      "href",
      "/rotas/nova?type=REGULAR",
    );
    expect(screen.getByRole("link", { name: "Nova rota eventual" })).toHaveAttribute(
      "href",
      "/rotas/nova?type=OCCASIONAL",
    );
  });
});
