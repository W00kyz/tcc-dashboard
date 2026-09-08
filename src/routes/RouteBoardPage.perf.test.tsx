import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BoardSnapshot } from "@/api/monitoringStream";
import { AuthProvider } from "@/auth/AuthContext";
import { RouteBoardPage } from "@/routes/RouteBoardPage";

vi.mock("@/api/monitoringStream", () => ({
  useBoardStream: () => ({ snapshot: null, fallback: false }),
}));

const EMPTY_SNAPSHOT: BoardSnapshot = {
  generated_at: "2026-08-31T12:00:00Z",
  routes: [],
  open_alerts: [],
  worker_positions: [],
};

const WORKERS = [
  {
    id: "w1",
    full_name: "João da Silva",
    contractor_company_id: "c1",
    service_type_ids: [],
    user_id: null,
  },
];

const ROUTES = Array.from({ length: 50 }, (_, index) => ({
  id: `r${String(index)}`,
  field_worker_id: "w1",
  field_worker_name: "João da Silva",
  route_date: "2026-08-31",
  route_type: index % 2 === 0 ? "REGULAR" : "OCCASIONAL",
  status: "PLANNED",
  scheduled_start_at: null,
  started_at: null,
  routing_degraded: false,
  stops: [
    {
      id: `s${String(index)}-1`,
      order_index: 1,
      status: "PENDING",
      service_point_name: "Sala 101",
    },
    {
      id: `s${String(index)}-2`,
      order_index: 2,
      status: "PENDING",
      service_point_name: "Sala 102",
    },
  ],
}));

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
    if (url.includes("/monitoring/board")) {
      return Promise.resolve(new Response(JSON.stringify(EMPTY_SNAPSHOT), { status: 200 }));
    }

    return Promise.resolve(new Response(JSON.stringify(ROUTES), { status: 200 }));
  });
}

describe("RouteBoardPage load time (RNF05)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // piso de sanidade contra regressão; a medição real no navegador é do autor (spec Ruling 10)
  it("renders 50 routes and reaches the board heading in under a second", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal("fetch", makeFakeFetch());

    const t0 = performance.now();
    render(
      <MemoryRouter initialEntries={["/rotas"]}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouteBoardPage />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await screen.findByText("Rotas de hoje");
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(1000);
  });
});
