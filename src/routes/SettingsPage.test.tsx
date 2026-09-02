import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { SettingsPage } from "@/routes/SettingsPage";

const SESSION = { accessToken: "token", refreshToken: "refresh", role: "ADMIN" };
const RANGE_MESSAGE = "Informe um valor entre 1 e 1000 metros.";

// openapi-fetch (0.17) always calls fetch with a single Request argument, so the method and
// the JSON body are read off that Request rather than a separate RequestInit.
function makeFakeFetch(radius = 50) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request;

    if (request.url.includes("/settings") && request.method === "PUT") {
      const body = (await request.clone().json()) as { check_radius_meters: number };

      return new Response(
        JSON.stringify({
          check_radius_meters: body.check_radius_meters,
          updated_at: "2026-09-02T00:00:00Z",
        }),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify({ check_radius_meters: radius, updated_at: "2026-09-01T00:00:00Z" }),
      { status: 200 },
    );
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

  it("loads the current tolerance radius into the field", async () => {
    renderSettingsPage(makeFakeFetch(50));

    expect(await screen.findByLabelText("Raio de tolerância (metros)")).toHaveValue(50);
  });

  it("blocks submit with a field error when the radius is out of range", async () => {
    const fakeFetch = makeFakeFetch(50);
    renderSettingsPage(fakeFetch);
    const input = await screen.findByLabelText("Raio de tolerância (metros)");

    await userEvent.clear(input);
    await userEvent.type(input, "0");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(RANGE_MESSAGE)).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, "1500");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(RANGE_MESSAGE)).toBeInTheDocument();

    expect(putRequests(fakeFetch)).toHaveLength(0);
  });

  it("saves a valid radius, shows a success status and invalidates the settings query", async () => {
    const fakeFetch = makeFakeFetch(50);
    const { invalidateSpy } = renderSettingsPage(fakeFetch);
    const input = await screen.findByLabelText("Raio de tolerância (metros)");

    await userEvent.clear(input);
    await userEvent.type(input, "75");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(putRequests(fakeFetch)).toHaveLength(1);
    });
    const putRequest = putRequests(fakeFetch).at(0);
    if (!putRequest) {
      throw new Error("expected a PUT /settings request");
    }
    expect(await putRequest.clone().json()).toEqual({ check_radius_meters: 75 });

    expect(await screen.findByRole("status")).toHaveTextContent("Configurações salvas.");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["settings"] });
  });
});
