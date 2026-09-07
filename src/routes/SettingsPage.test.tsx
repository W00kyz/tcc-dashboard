import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { SettingsPage } from "@/routes/SettingsPage";

const SESSION = { accessToken: "token", refreshToken: "refresh", role: "ADMIN" };
const RADIUS_RANGE_MESSAGE = "Informe um valor entre 1 e 1000 metros.";
const MINUTES_RANGE_MESSAGE = "Informe um valor entre 0 e 1440 minutos.";

const SETTINGS = {
  check_radius_meters: 50,
  alert_scan_interval_seconds: 60,
  position_report_interval_seconds: 30,
  late_start_tolerance_min: 15,
  absence_tolerance_min: 30,
  late_stop_tolerance_min: 15,
  no_evidence_grace_min: 30,
  updated_at: "2026-09-01T00:00:00Z",
};

// openapi-fetch (0.17) always calls fetch with a single Request argument, so the method and
// the JSON body are read off that Request rather than a separate RequestInit.
function makeFakeFetch(overrides: Partial<typeof SETTINGS> = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request;

    if (request.url.includes("/settings") && request.method === "PUT") {
      const body = (await request.clone().json()) as Record<string, number>;

      return new Response(
        JSON.stringify({ ...SETTINGS, ...body, updated_at: "2026-09-02T00:00:00Z" }),
        { status: 200 },
      );
    }

    return new Response(JSON.stringify({ ...SETTINGS, ...overrides }), { status: 200 });
  });
}

function putRequests(fakeFetch: ReturnType<typeof makeFakeFetch>): Request[] {
  return fakeFetch.mock.calls
    .map(([input]) => input as Request)
    .filter((request) => request.method === "PUT");
}

function renderSettingsPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SettingsPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );

  return { invalidateSpy };
}

describe("SettingsPage", () => {
  beforeEach(() => {
    localStorage.setItem("route-monitor.session", JSON.stringify(SESSION));
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads all seven current settings values into the fields", async () => {
    renderSettingsPage(makeFakeFetch());

    expect(await screen.findByLabelText("Raio de tolerância (metros)")).toHaveValue(50);
    expect(screen.getByLabelText("Intervalo de varredura de alertas (segundos)")).toHaveValue(60);
    expect(screen.getByLabelText("Intervalo de envio de posição (segundos)")).toHaveValue(30);
    expect(screen.getByLabelText("Tolerância para início de rota (minutos)")).toHaveValue(15);
    expect(screen.getByLabelText("Tolerância para ausência do profissional (minutos)")).toHaveValue(
      30,
    );
    expect(screen.getByLabelText("Tolerância para ponto atrasado (minutos)")).toHaveValue(15);
    expect(screen.getByLabelText("Prazo para anexar evidência (minutos)")).toHaveValue(30);
  });

  it("blocks submit with a field error when the radius is out of range", async () => {
    const fakeFetch = makeFakeFetch();
    renderSettingsPage(fakeFetch);
    const input = await screen.findByLabelText("Raio de tolerância (metros)");

    await userEvent.clear(input);
    await userEvent.type(input, "0");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(RADIUS_RANGE_MESSAGE)).toBeInTheDocument();

    expect(putRequests(fakeFetch)).toHaveLength(0);
  });

  it("blocks submit and shows the range error when a tolerance is out of range", async () => {
    const fakeFetch = makeFakeFetch();
    renderSettingsPage(fakeFetch);
    const input = await screen.findByLabelText("Tolerância para ponto atrasado (minutos)");

    await userEvent.clear(input);
    await userEvent.type(input, "5000");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(MINUTES_RANGE_MESSAGE)).toBeInTheDocument();
    expect(putRequests(fakeFetch)).toHaveLength(0);
  });

  it("saves all seven values, shows a success status and invalidates the settings query", async () => {
    const fakeFetch = makeFakeFetch();
    const { invalidateSpy } = renderSettingsPage(fakeFetch);
    const input = await screen.findByLabelText("Tolerância para início de rota (minutos)");

    await userEvent.clear(input);
    await userEvent.type(input, "20");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(putRequests(fakeFetch)).toHaveLength(1);
    });
    const putRequest = putRequests(fakeFetch).at(0);
    if (!putRequest) {
      throw new Error("expected a PUT /settings request");
    }
    expect(await putRequest.clone().json()).toEqual({
      check_radius_meters: 50,
      alert_scan_interval_seconds: 60,
      position_report_interval_seconds: 30,
      late_start_tolerance_min: 20,
      absence_tolerance_min: 30,
      late_stop_tolerance_min: 15,
      no_evidence_grace_min: 30,
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Configurações salvas.");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["settings"] });
  });
});
