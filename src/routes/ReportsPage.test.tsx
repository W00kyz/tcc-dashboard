import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { ReportsPage } from "@/routes/ReportsPage";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

const PERIOD = {
  period_label: "01/08",
  period_start: "2026-08-01",
  routes_total: 4,
  routes_started: 3,
  routes_completed: 2,
  routes_cancelled: 1,
  stops_total: 10,
  stops_done: 5,
  stops_pending: 5,
  stops_reassigned: 0,
  executions_total: 6,
  executions_with_evidence: 4,
  executions_flagged: 1,
  impediments_total: 0,
  alerts_total: 2,
  completion_rate: 0.5,
};

const REPORT = {
  granularity: "DAILY",
  date_from: "2026-08-01",
  date_to: "2026-08-02",
  filters_applied: {
    field_worker_name: "João da Silva",
    service_type_name: null,
    building_name: null,
    route_status: null,
  },
  periods: [PERIOD],
  totals: { ...PERIOD, period_label: undefined, period_start: undefined },
  generated_at: "2026-08-03T00:00:00Z",
};

function makeFakeFetch(options: { report?: unknown; exportOk?: boolean } = {}) {
  const report = options.report ?? REPORT;
  const exportOk = options.exportOk ?? true;

  return vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);

    if (url.includes("/reports/compliance.pdf") || url.includes("/reports/compliance.xlsx")) {
      return Promise.resolve(
        exportOk
          ? new Response(new Blob(["binary"]), { status: 200 })
          : new Response("nope", { status: 500 }),
      );
    }
    if (url.includes("/reports/compliance")) {
      return Promise.resolve(new Response(JSON.stringify(report), { status: 200 }));
    }
    if (
      url.includes("/field-workers") ||
      url.includes("/service-types") ||
      url.includes("/buildings")
    ) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }

    return Promise.resolve(new Response("{}", { status: 200 }));
  });
}

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <MemoryRouter initialEntries={["/relatorios"]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ReportsPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function reportRequests(fakeFetch: ReturnType<typeof makeFakeFetch>): string[] {
  return fakeFetch.mock.calls.map(([input]) => requestUrl(input));
}

function setRange(from = "2026-08-01", to = "2026-08-02") {
  fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("Data final"), { target: { value: to } });
}

describe("ReportsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps 'Gerar relatório' disabled until a valid date range is set", () => {
    renderPage(makeFakeFetch());

    const generate = screen.getByRole("button", { name: "Gerar relatório" });
    expect(generate).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-08-05" } });
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-08-01" } });
    expect(generate).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-08-10" } });
    expect(generate).toBeEnabled();
  });

  it("fetches /reports/compliance with the current filter values on Gerar", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    setRange();
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));

    await waitFor(() => {
      expect(
        reportRequests(fakeFetch).some(
          (url) =>
            url.includes("/reports/compliance?") &&
            url.includes("granularity=DAILY") &&
            url.includes("date_from=2026-08-01") &&
            url.includes("date_to=2026-08-02"),
        ),
      ).toBe(true);
    });
  });

  it("renders the period rows, a bold TOTAIS row and the pt-BR completion rate", async () => {
    renderPage(makeFakeFetch());

    setRange();
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));

    expect(await screen.findByRole("cell", { name: "01/08" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "TOTAIS" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "50,0%" }).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the empty state when the report has no periods", async () => {
    renderPage(makeFakeFetch({ report: { ...REPORT, periods: [] } }));

    setRange();
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));

    expect(
      await screen.findByText("Nenhuma rota no período com os filtros selecionados."),
    ).toBeInTheDocument();
  });

  it("downloads a PDF via a fetch to /reports/compliance.pdf and an <a download> click", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    setRange();
    fireEvent.click(screen.getByRole("button", { name: "Exportar PDF" }));

    await waitFor(() => {
      expect(
        reportRequests(fakeFetch).some(
          (url) =>
            url.includes("/reports/compliance.pdf?") &&
            url.includes("date_from=2026-08-01") &&
            url.includes("date_to=2026-08-02"),
        ),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
    });
    expect(click).toHaveBeenCalled();
  });

  it("shows an export error when the download response is not ok", async () => {
    renderPage(makeFakeFetch({ exportOk: false }));

    setRange();
    fireEvent.click(screen.getByRole("button", { name: "Exportar XLSX" }));

    expect(await screen.findByText("Não foi possível exportar o relatório.")).toBeInTheDocument();
  });

  it("registers /relatorios under the MANAGER/ADMIN ProtectedRoute branch", () => {
    const managerBranch = appRoutes.find((branch) =>
      branch.children?.some((child) => child.path === "/rotas"),
    );
    const adminBranch = appRoutes.find((branch) =>
      branch.children?.some((child) => child.path === "/usuarios"),
    );

    expect(managerBranch?.children?.map((child) => child.path)).toContain("/relatorios");
    expect(adminBranch?.children?.map((child) => child.path)).not.toContain("/relatorios");
  });
});
