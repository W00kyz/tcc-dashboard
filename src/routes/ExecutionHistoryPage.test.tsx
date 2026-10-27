import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ExecutionHistoryPage } from "@/routes/ExecutionHistoryPage";

const EXECUTION_A = {
  execution_id: "e1",
  field_worker_id: "w1",
  field_worker_name: "João da Silva",
  service_point_id: "sp1",
  service_point_name: "Sala 101",
  building_id: "b1",
  building_name: "Bloco CG",
  floor_label: "Térreo",
  checked_in_at: "2026-08-30T13:05:00Z",
  checked_out_at: "2026-08-30T13:40:00Z",
  geo_validation: "VALIDATED",
  review_status: "PENDING_REVIEW",
  validation_flags: [],
  source: "APP",
  evidence_count: 3,
  route_id: "r1",
  clock_skew_seconds: null,
  appeal_id: null,
};

const EXECUTION_B = {
  execution_id: "e2",
  field_worker_id: "w2",
  field_worker_name: "Maria Souza",
  service_point_id: "sp2",
  service_point_name: "Sala 202",
  building_id: "b1",
  building_name: "Bloco CG",
  floor_label: "1º andar",
  checked_in_at: "2026-08-30T09:00:00Z",
  checked_out_at: null,
  geo_validation: null,
  review_status: "NONE",
  validation_flags: [],
  source: "APPEAL",
  evidence_count: 0,
  route_id: "r2",
  clock_skew_seconds: null,
  appeal_id: "ap1",
};

const EXECUTION_A_DETAIL = {
  ...EXECUTION_A,
  scans: [],
  evidence: [],
};

const WORKERS = [
  { id: "w1", full_name: "João da Silva", contractor_company_id: "c1" },
  { id: "w2", full_name: "Maria Souza", contractor_company_id: "c1" },
];

const BUILDINGS = [{ id: "b1", name: "Bloco CG", campus_area: "Central" }];

const SERVICE_TYPES = [
  { id: "st1", name: "Limpeza", average_duration_minutes: 30 },
  { id: "st2", name: "Jardinagem", average_duration_minutes: 45 },
];

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function makeFakeFetch(total = 2, items: unknown[] = [EXECUTION_A, EXECUTION_B]) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);

    if (url.includes("/field-workers")) {
      return Promise.resolve(new Response(JSON.stringify(WORKERS), { status: 200 }));
    }

    if (url.includes("/buildings")) {
      return Promise.resolve(new Response(JSON.stringify(BUILDINGS), { status: 200 }));
    }

    if (url.includes("/service-types")) {
      return Promise.resolve(new Response(JSON.stringify(SERVICE_TYPES), { status: 200 }));
    }

    if (/\/executions\/e1(\/|$|\?)/.test(url)) {
      return Promise.resolve(new Response(JSON.stringify(EXECUTION_A_DETAIL), { status: 200 }));
    }

    return Promise.resolve(
      new Response(JSON.stringify({ items, total, page: 1, page_size: 50 }), { status: 200 }),
    );
  });
}

function executionQueries(fakeFetch: ReturnType<typeof makeFakeFetch>): string[] {
  return fakeFetch.mock.calls
    .map(([input]) => requestUrl(input))
    .filter((url) => /\/executions(\?|$)/.test(url));
}

function renderPage(fetchImpl: typeof fetch, path = "/execucoes") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ExecutionHistoryPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ExecutionHistoryPage", () => {
  it("renders one row per execution with worker, point and check-in time", async () => {
    renderPage(makeFakeFetch());

    expect(await screen.findByRole("cell", { name: "João da Silva" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Maria Souza" })).toBeInTheDocument();
    expect(screen.getByText("Sala 101")).toBeInTheDocument();

    const checkIn = new Date(EXECUTION_A.checked_in_at).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
    expect(screen.getByText(checkIn)).toBeInTheDocument();
  });

  it("names the origin of each execution, an accepted appeal as 'Por recurso'", async () => {
    renderPage(makeFakeFetch());

    // Each row is a button that opens the drawer, named after its worker.
    const appealRow = await screen.findByRole("button", { name: /Maria Souza/ });
    expect(within(appealRow).getByText("Por recurso")).toBeInTheDocument();
    const appRow = screen.getByRole("button", { name: /João da Silva/ });
    expect(within(appRow).getByText("App")).toBeInTheDocument();
  });

  it("filters by origin: app or appeal, no more manual completion", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);
    await screen.findByRole("button", { name: /Maria Souza/ });

    const source = screen.getByLabelText("Origem");
    expect(
      within(source)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Todas", "App", "Por recurso"]);
    fireEvent.change(source, { target: { value: "APPEAL" } });

    await waitFor(() => {
      expect(executionQueries(fakeFetch).some((url) => url.includes("source=APPEAL"))).toBe(true);
    });
  });

  it("shows the empty state when no execution matches", async () => {
    renderPage(makeFakeFetch(0, []));

    expect(await screen.findByText("Nenhuma execução encontrada.")).toBeInTheDocument();
  });

  it("pushes the chosen worker into the /executions query string and refetches", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    await screen.findByRole("cell", { name: "João da Silva" });

    fireEvent.change(screen.getByLabelText("Profissional"), { target: { value: "w1" } });

    await waitFor(() => {
      expect(executionQueries(fakeFetch).some((url) => url.includes("field_worker_id=w1"))).toBe(
        true,
      );
    });
  });

  it("pushes the chosen service type into the /executions query string and the URL", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    await screen.findByRole("cell", { name: "João da Silva" });

    fireEvent.change(screen.getByLabelText("Tipo de serviço"), { target: { value: "st1" } });

    await waitFor(() => {
      expect(executionQueries(fakeFetch).some((url) => url.includes("service_type_id=st1"))).toBe(
        true,
      );
    });
  });

  it("defaults date_from via toLocalIsoDate and round-trips it through the query string", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch, "/execucoes?date_from=2026-08-01");

    await screen.findByRole("cell", { name: "João da Silva" });

    expect(screen.getByLabelText("Data inicial")).toHaveValue("2026-08-01");
    await waitFor(() => {
      expect(executionQueries(fakeFetch).some((url) => url.includes("date_from=2026-08-01"))).toBe(
        true,
      );
    });
  });

  it("paginates: shows total page count and advances the page on next", async () => {
    const fakeFetch = makeFakeFetch(120);
    renderPage(fakeFetch);

    expect(await screen.findByText("Página 1 de 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));

    await waitFor(() => {
      expect(executionQueries(fakeFetch).some((url) => /[?&]page=2(&|$)/.test(url))).toBe(true);
    });
  });

  it("opens the detail drawer on a row click and loads the execution detail", async () => {
    renderPage(makeFakeFetch());

    const workerCell = await screen.findByRole("cell", { name: "João da Silva" });
    fireEvent.click(workerCell);

    const drawer = screen.getByRole("dialog", { name: "Detalhe da execução" });
    expect(await within(drawer).findByText("Linha do tempo")).toBeInTheDocument();
  });

  it("opens the detail drawer when a row is activated with the keyboard", async () => {
    renderPage(makeFakeFetch());

    await screen.findByRole("cell", { name: "João da Silva" });
    const row = screen.getByRole("button", { name: "Ver detalhe da execução de João da Silva" });
    fireEvent.keyDown(row, { key: "Enter" });

    const drawer = screen.getByRole("dialog", { name: "Detalhe da execução" });
    expect(await within(drawer).findByText("Linha do tempo")).toBeInTheDocument();
  });
});
