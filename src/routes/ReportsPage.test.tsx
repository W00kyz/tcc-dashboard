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
  points_total: 10,
  points_done: 5,
  points_done_by_appeal: 1,
  points_unserved: 5,
  points_released: 4,
  points_impeded: 1,
  released_route_remainder: 0,
  released_left_campus: 2,
  released_location_silence: 1,
  released_end_of_day: 0,
  executions_total: 6,
  executions_with_evidence: 4,
  executions_flagged: 1,
  alerts_total: 2,
  completion_rate: 0.5,
};

const REPORT = {
  granularity: "DAILY",
  date_from: "2026-08-01",
  date_to: "2026-08-02",
  filters_applied: {
    field_worker_name: "João da Silva",
    company_name: "Limpa Tudo",
    service_type_name: null,
    building_name: null,
    outcome: "Feito por recurso",
  },
  periods: [PERIOD],
  totals: { ...PERIOD, period_label: undefined, period_start: undefined },
  generated_at: "2026-08-03T00:00:00Z",
};

const COMPANIES = [{ id: "c1", name: "Limpa Tudo", cnpj: "00.000.000/0001-00", service_types: [] }];

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
    if (url.includes("/contractor-companies")) {
      return Promise.resolve(new Response(JSON.stringify(COMPANIES), { status: 200 }));
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

    // The period reads as a pt-BR date built from period_start, not the API's period_label.
    expect(await screen.findByRole("cell", { name: "01/08/2026" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "TOTAIS" })).toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "50,0%" }).length).toBeGreaterThanOrEqual(2);
  });

  it("filters by company and by point outcome, with the API's pt-BR labels", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const outcome = screen.getByLabelText("Situação do ponto");
    expect(
      Array.from(outcome.querySelectorAll("option")).map((option) => option.textContent),
    ).toEqual(["Todos", "Feito", "Feito por recurso", "Não atendido"]);
    expect(screen.queryByLabelText("Status de rota")).not.toBeInTheDocument();

    setRange();
    await screen.findByRole("option", { name: "Limpa Tudo" });
    fireEvent.change(screen.getByLabelText("Empresa"), { target: { value: "c1" } });
    fireEvent.change(outcome, { target: { value: "DONE_BY_APPEAL" } });
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));

    await waitFor(() => {
      expect(
        reportRequests(fakeFetch).some(
          (url) =>
            url.includes("/reports/compliance?") &&
            url.includes("company_id=c1") &&
            url.includes("outcome=DONE_BY_APPEAL"),
        ),
      ).toBe(true);
    });
    expect(
      await screen.findByText(/João da Silva · Limpa Tudo · Feito por recurso/),
    ).toBeInTheDocument();
  });

  it("shows the point-day indicators, releases by reason and the executions", async () => {
    renderPage(makeFakeFetch());

    setRange();
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));

    await screen.findByRole("cell", { name: "TOTAIS" });
    for (const header of [
      "Pontos no dia",
      "Feitos",
      "Por recurso",
      "Não atendidos",
      "Liberações",
      "Impedimento",
      "Resto da rota impedido",
      "Saiu do campus",
      "Sem localização",
      "Fim do expediente",
      "Execuções",
      "Com evidência",
      "Sinalizadas",
      "Alertas",
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(screen.queryByRole("columnheader", { name: "Reatrib." })).not.toBeInTheDocument();
  });

  it("shows the empty state when the report has no periods", async () => {
    renderPage(makeFakeFetch({ report: { ...REPORT, periods: [] } }));

    setRange();
    fireEvent.click(screen.getByRole("button", { name: "Gerar relatório" }));

    expect(
      await screen.findByText("Nenhum ponto no período com os filtros selecionados."),
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

  it("shows an export error when the download fetch rejects at the transport level", async () => {
    const rejectingFetch = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/reports/compliance.pdf") || url.includes("/reports/compliance.xlsx")) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }

      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }) as unknown as typeof fetch;
    renderPage(rejectingFetch);

    setRange();
    fireEvent.click(screen.getByRole("button", { name: "Exportar PDF" }));

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
