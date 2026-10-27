import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { SettingsPage } from "@/routes/SettingsPage";

const SESSION = { accessToken: "token", refreshToken: "refresh", role: "ADMIN" };
const RADIUS_RANGE_MESSAGE = "Informe um valor entre 1 e 1000 metros.";

const SETTINGS = {
  check_radius_meters: 50,
  alert_scan_interval_seconds: 60,
  position_report_interval_seconds: 30,
  no_evidence_grace_min: 30,
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
  updated_at: "2026-09-01T00:00:00Z",
};

// openapi-fetch (0.17) always calls fetch with a single Request argument, so the method and
// the JSON body are read off that Request rather than a separate RequestInit.
function makeFakeFetch(overrides: Partial<typeof SETTINGS> = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request;

    if (request.url.includes("/settings") && request.method === "PUT") {
      const body = (await request.clone().json()) as Record<string, unknown>;

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

  it("loads every current setting into its field", async () => {
    renderSettingsPage(makeFakeFetch());

    expect(await screen.findByLabelText("Raio de tolerância (metros)")).toHaveValue(50);
    expect(screen.getByLabelText("Intervalo de varredura de alertas (segundos)")).toHaveValue(60);
    expect(screen.getByLabelText("Intervalo de envio de posição (segundos)")).toHaveValue(30);
    expect(screen.getByLabelText("Prazo para anexar evidência (minutos)")).toHaveValue(30);
    expect(screen.getByLabelText("Pontos por lote")).toHaveValue(4);
    expect(screen.getByLabelText("Latitude mínima")).toHaveValue(-7.225);
    expect(screen.getByLabelText("Latitude máxima")).toHaveValue(-7.205);
    expect(screen.getByLabelText("Longitude mínima")).toHaveValue(-35.92);
    expect(screen.getByLabelText("Longitude máxima")).toHaveValue(-35.898);
    expect(screen.getByLabelText("Minutos fora do campus até liberar os pontos")).toHaveValue(10);
    expect(screen.getByLabelText("Minutos sem localização até avisar o profissional")).toHaveValue(
      30,
    );
    expect(screen.getByLabelText("Minutos sem localização até liberar os pontos")).toHaveValue(45);
    expect(screen.getByLabelText("Fim do expediente")).toHaveValue("17:00");
    expect(screen.getByLabelText("Prazo para recorrer (horas)")).toHaveValue(48);
    for (const day of ["Seg", "Ter", "Qua", "Qui", "Sex"]) {
      expect(screen.getByRole("checkbox", { name: day })).toBeChecked();
    }
    expect(screen.getByRole("checkbox", { name: "Sáb" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Dom" })).not.toBeChecked();
  });

  it("no longer offers the planned-schedule tolerances", async () => {
    renderSettingsPage(makeFakeFetch());

    await screen.findByLabelText("Pontos por lote");
    expect(screen.queryByText(/Tolerância para/)).not.toBeInTheDocument();
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

  it("blocks a silence release that does not come after the warning", async () => {
    const fakeFetch = makeFakeFetch();
    renderSettingsPage(fakeFetch);
    const input = await screen.findByLabelText("Minutos sem localização até liberar os pontos");

    await userEvent.clear(input);
    await userEvent.type(input, "20");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("A liberação por falta de localização deve vir depois do aviso."),
    ).toBeInTheDocument();
    expect(putRequests(fakeFetch)).toHaveLength(0);
  });

  it("blocks a campus perimeter whose minimum is not below its maximum", async () => {
    const fakeFetch = makeFakeFetch();
    renderSettingsPage(fakeFetch);
    const input = await screen.findByLabelText("Latitude mínima");

    await userEvent.clear(input);
    await userEvent.type(input, "-7.1");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("A latitude mínima deve ser menor que a máxima."),
    ).toBeInTheDocument();
    expect(putRequests(fakeFetch)).toHaveLength(0);
  });

  it("blocks submit when no service day is left", async () => {
    const fakeFetch = makeFakeFetch({ service_weekdays: [0] });
    renderSettingsPage(fakeFetch);
    const monday = await screen.findByRole("checkbox", { name: "Seg" });

    await userEvent.click(monday);
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Selecione ao menos um dia de serviço.")).toBeInTheDocument();
    expect(putRequests(fakeFetch)).toHaveLength(0);
  });

  it("saves every value, shows a success status and invalidates the settings query", async () => {
    const fakeFetch = makeFakeFetch();
    const { invalidateSpy } = renderSettingsPage(fakeFetch);
    const batch = await screen.findByLabelText("Pontos por lote");

    await userEvent.clear(batch);
    await userEvent.type(batch, "6");
    await userEvent.click(screen.getByRole("checkbox", { name: "Sex" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Sáb" }));
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
      no_evidence_grace_min: 30,
      allocation_batch_size: 6,
      campus_min_lat: -7.225,
      campus_max_lat: -7.205,
      campus_min_lng: -35.92,
      campus_max_lng: -35.898,
      outside_campus_release_minutes: 10,
      location_silence_warning_minutes: 30,
      location_silence_release_minutes: 45,
      workday_end_time: "17:00:00",
      service_weekdays: [0, 1, 2, 3, 5],
      appeal_window_hours: 48,
    });

    expect(await screen.findByRole("status")).toHaveTextContent("Configurações salvas.");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["settings"] });
  });
});
