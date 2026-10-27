import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appRoutes } from "@/App";
import { AlertRulesPage } from "@/routes/AlertRulesPage";
import { AuthProvider } from "@/auth/AuthContext";
import { ConsentGate } from "@/auth/ConsentGate";
import { ProtectedRoute } from "@/auth/ProtectedRoute";

const SESSION = { accessToken: "token", refreshToken: "refresh", role: "MANAGER" };

const RULES = [
  { rule_kind: "NO_EVIDENCE", enabled: true, threshold_minutes: null, updated_at: null },
  { rule_kind: "POINT_IMPEDED", enabled: true, threshold_minutes: null, updated_at: null },
  { rule_kind: "BATCH_RELEASED", enabled: true, threshold_minutes: null, updated_at: null },
  { rule_kind: "POINTS_UNSERVED", enabled: true, threshold_minutes: null, updated_at: null },
  { rule_kind: "APPEAL_FILED", enabled: false, threshold_minutes: null, updated_at: null },
];

const SETTINGS = {
  check_radius_meters: 50,
  alert_scan_interval_seconds: 60,
  no_evidence_grace_min: 25,
  position_report_interval_seconds: 60,
  allocation_batch_size: 4,
  campus_min_lat: -7.225,
  campus_max_lat: -7.205,
  campus_min_lng: -35.92,
  campus_max_lng: -35.898,
  outside_campus_release_minutes: 10,
  location_silence_warning_minutes: 30,
  location_silence_release_minutes: 45,
  workday_end_time: "17:00:00",
  service_weekdays: [0, 1, 2, 3, 4],
  appeal_window_hours: 48,
  updated_at: null,
};

function makeFakeFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const request = input as Request;

    if (request.url.includes("/alert-rules") && request.method === "PATCH") {
      return Promise.resolve(new Response(JSON.stringify(RULES[0]), { status: 200 }));
    }
    if (request.url.includes("/settings")) {
      return Promise.resolve(new Response(JSON.stringify(SETTINGS), { status: 200 }));
    }

    return Promise.resolve(new Response(JSON.stringify(RULES), { status: 200 }));
  });
}

function patchRequests(fakeFetch: ReturnType<typeof makeFakeFetch>): Request[] {
  return fakeFetch.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === "PATCH");
}

function firstPatch(fakeFetch: ReturnType<typeof makeFakeFetch>): Request {
  const request = patchRequests(fakeFetch)[0];
  if (!request) {
    throw new Error("expected a PATCH /alert-rules request");
  }

  return request;
}

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AlertRulesPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("AlertRulesPage", () => {
  beforeEach(() => {
    localStorage.setItem("route-monitor.session", JSON.stringify(SESSION));
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the five rules with their pt-BR names, in order", async () => {
    renderPage(makeFakeFetch());

    await screen.findByText("Sem evidência");
    const names = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.querySelector("td")?.textContent);
    expect(names).toEqual([
      "Sem evidência",
      "Ponto impedido",
      "Lote liberado",
      "Pontos não atendidos",
      "Recurso recebido",
    ]);
  });

  it("toggling a rule off sends PATCH /alert-rules/BATCH_RELEASED with { enabled: false }", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const checkbox = await screen.findByRole("checkbox", { name: "Lote liberado" });
    await userEvent.click(checkbox);

    await waitFor(() => {
      expect(patchRequests(fakeFetch)).toHaveLength(1);
    });
    const request = firstPatch(fakeFetch);
    expect(request.url).toContain("/alert-rules/BATCH_RELEASED");
    expect(await request.clone().json()).toEqual({ enabled: false });
  });

  it("offers a threshold only for the timed rule; the event rules fire on the event", async () => {
    renderPage(makeFakeFetch());

    expect(await screen.findByLabelText("Sem evidência — Limiar (minutos)")).toHaveValue(25);
    expect(screen.getByText("Padrão global")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ponto impedido — Limiar (minutos)")).not.toBeInTheDocument();
    expect(screen.getAllByText("Dispara no próprio evento")).toHaveLength(4);
  });

  it("typing a threshold commits it on blur as a number", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const input = await screen.findByLabelText("Sem evidência — Limiar (minutos)");
    await userEvent.clear(input);
    await userEvent.type(input, "20");
    await userEvent.tab();

    await waitFor(() => {
      expect(patchRequests(fakeFetch)).toHaveLength(1);
    });
    const request = firstPatch(fakeFetch);
    expect(request.url).toContain("/alert-rules/NO_EVIDENCE");
    expect(await request.clone().json()).toEqual({ threshold_minutes: 20 });
  });

  it("clearing an override commits null (use the global default)", async () => {
    const overridden = RULES.map((rule) =>
      rule.rule_kind === "NO_EVIDENCE" ? { ...rule, threshold_minutes: 40 } : rule,
    );
    const fakeFetch = vi.fn((input: RequestInfo | URL) => {
      const request = input as Request;
      if (request.url.includes("/settings")) {
        return Promise.resolve(new Response(JSON.stringify(SETTINGS), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify(overridden), { status: 200 }));
    });
    renderPage(fakeFetch);

    const input = await screen.findByLabelText("Sem evidência — Limiar (minutos)");
    expect(input).toHaveValue(40);
    expect(screen.getByText("Padrão global: 25 min")).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.tab();

    await waitFor(() => {
      expect(patchRequests(fakeFetch)).toHaveLength(1);
    });
    const request = firstPatch(fakeFetch);
    expect(request.url).toContain("/alert-rules/NO_EVIDENCE");
    expect(await request.clone().json()).toEqual({ threshold_minutes: null });
    expect(input).toHaveValue(25);
  });

  it("blurring an untouched default does not send a PATCH", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const input = await screen.findByLabelText("Sem evidência — Limiar (minutos)");
    await userEvent.click(input);
    await userEvent.tab();

    expect(patchRequests(fakeFetch)).toHaveLength(0);
  });

  it("registers /regras-de-alerta under the MANAGER/ADMIN ProtectedRoute", () => {
    const managerBranch = appRoutes.find((branch) =>
      branch.children?.some((child) => child.path === "/rotas"),
    );

    const branchElement = managerBranch?.element;
    expect(isValidElement(branchElement) && branchElement.type).toBe(ConsentGate);
    const guarded = isValidElement<{ children?: ReactNode }>(branchElement)
      ? branchElement.props.children
      : null;
    expect(isValidElement(guarded) && guarded.type).toBe(ProtectedRoute);
    expect(managerBranch?.children?.map((child) => child.path)).toContain("/regras-de-alerta");
  });
});
