import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { isValidElement } from "react";

import { appRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
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
      status: "IN_PROGRESS",
      service_point_name: "Sala 103",
      building_name: "Bloco A",
    },
    {
      id: "s4",
      order_index: 4,
      status: "PENDING",
      service_point_name: "Sala 104",
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

  it("names the affected stop for a STOP impediment and counts only PENDING stops for ROUTE_REMAINDER", async () => {
    renderPage(makeFakeFetch());

    const card = await screen.findByTestId("impediment-card-imp1");
    await within(card).findByText(/Sala 102 · Bloco A/);

    // The route has 2 PENDING stops (s2, s4), 1 DONE (s1) and 1 IN_PROGRESS (s3). Only the
    // PENDING pair is reassigned, so the tally is "2", not "3".
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

  async function openReassignDialog(fakeFetch: ReturnType<typeof makeFakeFetch>) {
    const user = userEvent.setup();
    renderPage(fakeFetch);

    const card = await screen.findByTestId("impediment-card-imp1");
    await user.click(within(card).getByRole("button", { name: "Ver candidatos" }));

    const candidate = await within(card).findByText("Maria Souza");
    await user.click(
      within(candidate.closest("li") as HTMLElement).getByRole("button", { name: "Reatribuir" }),
    );

    return { user, dialog: await screen.findByRole("dialog") };
  }

  async function reassignRequestBody(fakeFetch: ReturnType<typeof makeFakeFetch>) {
    const call = fakeFetch.mock.calls.find(
      ([input, init]) =>
        requestUrl(input).includes("/impediments/imp1/reassign") &&
        requestMethod(input, init) === "POST",
    );
    if (call === undefined) {
      throw new Error("expected a POST to /impediments/imp1/reassign");
    }

    return (await (call[0] as Request).clone().json()) as Record<string, unknown>;
  }

  it("sends the manager-typed reason with the chosen candidate", async () => {
    const fakeFetch = makeFakeFetch();
    const { user, dialog } = await openReassignDialog(fakeFetch);

    await user.type(
      within(dialog).getByLabelText("Motivo da reatribuição (opcional)"),
      "Profissional mais próximo do bloco",
    );
    await user.click(within(dialog).getByRole("button", { name: "Reatribuir" }));

    await waitFor(async () => {
      expect(await reassignRequestBody(fakeFetch)).toEqual({
        field_worker_id: "w2",
        reason: "Profissional mais próximo do bloco",
      });
    });
  });

  it("falls back to the pt-BR default reason when the field is left blank", async () => {
    const fakeFetch = makeFakeFetch();
    const { user, dialog } = await openReassignDialog(fakeFetch);

    await user.click(within(dialog).getByRole("button", { name: "Reatribuir" }));

    await waitFor(async () => {
      expect(await reassignRequestBody(fakeFetch)).toEqual({
        field_worker_id: "w2",
        reason: "Reatribuição manual pela fila de reatribuições",
      });
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

  it("registers /reatribuicoes under the MANAGER/ADMIN ProtectedRoute branch", () => {
    const managerBranch = appRoutes.find((branch) =>
      branch.children?.some((child) => child.path === "/rotas"),
    );
    const branchElement = managerBranch?.element;

    expect(isValidElement(branchElement) && branchElement.type).toBe(ProtectedRoute);
    expect(managerBranch?.children?.map((child) => child.path)).toEqual(
      expect.arrayContaining(["/reatribuicoes"]),
    );
  });
});
