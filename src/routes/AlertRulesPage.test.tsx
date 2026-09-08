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
  { rule_kind: "LATE_START", enabled: true, threshold_minutes: null, updated_at: null },
  { rule_kind: "WORKER_ABSENT", enabled: true, threshold_minutes: 45, updated_at: null },
  { rule_kind: "LATE_STOP", enabled: true, threshold_minutes: null, updated_at: null },
  { rule_kind: "NO_EVIDENCE", enabled: false, threshold_minutes: null, updated_at: null },
];

function makeFakeFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const request = input as Request;

    if (request.url.includes("/alert-rules") && request.method === "PATCH") {
      return Promise.resolve(new Response(JSON.stringify(RULES[0]), { status: 200 }));
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

  it("renders the four rules with their pt-BR names", async () => {
    renderPage(makeFakeFetch());

    expect(await screen.findByText("Rota não iniciada")).toBeInTheDocument();
    expect(screen.getByText("Profissional ausente")).toBeInTheDocument();
    expect(screen.getByText("Ponto atrasado")).toBeInTheDocument();
    expect(screen.getByText("Execução sem evidência")).toBeInTheDocument();
  });

  it("toggling a rule off sends PATCH /alert-rules/LATE_STOP with { enabled: false }", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const checkbox = await screen.findByRole("checkbox", { name: "Ponto atrasado" });
    await userEvent.click(checkbox);

    await waitFor(() => {
      expect(patchRequests(fakeFetch)).toHaveLength(1);
    });
    const request = firstPatch(fakeFetch);
    expect(request.url).toContain("/alert-rules/LATE_STOP");
    expect(await request.clone().json()).toEqual({ enabled: false });
  });

  it("typing a threshold commits it on blur as a number", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const input = await screen.findByLabelText("Rota não iniciada — Limiar (minutos)");
    await userEvent.type(input, "20");
    await userEvent.tab();

    await waitFor(() => {
      expect(patchRequests(fakeFetch)).toHaveLength(1);
    });
    const request = firstPatch(fakeFetch);
    expect(request.url).toContain("/alert-rules/LATE_START");
    expect(await request.clone().json()).toEqual({ threshold_minutes: 20 });
  });

  it("clearing a threshold commits null (use the global default)", async () => {
    const fakeFetch = makeFakeFetch();
    renderPage(fakeFetch);

    const input = await screen.findByLabelText("Profissional ausente — Limiar (minutos)");
    await userEvent.clear(input);
    await userEvent.tab();

    await waitFor(() => {
      expect(patchRequests(fakeFetch)).toHaveLength(1);
    });
    const request = firstPatch(fakeFetch);
    expect(request.url).toContain("/alert-rules/WORKER_ABSENT");
    expect(await request.clone().json()).toEqual({ threshold_minutes: null });
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
