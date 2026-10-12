import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { BuildingFootprintSection } from "@/components/buildings/BuildingFootprintSection";
import type { OsmBuilding } from "@/lib/osmBuildings";

const OSM: OsmBuilding[] = [
  {
    osmWayId: 42,
    name: "Bloco CD (UFCG)",
    footprint: {
      type: "Polygon",
      coordinates: [
        [
          [-35.909, -7.214],
          [-35.908, -7.214],
          [-35.908, -7.215],
          [-35.909, -7.214],
        ],
      ],
    },
  },
];

function building(footprint: unknown = null) {
  return {
    id: "b1",
    name: "Bloco CD",
    campus_area: "CEEI",
    footprint,
    footprint_source: null,
    osm_way_id: null,
  };
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function renderSection(fakeFetch: typeof fetch, fetchOsm: () => Promise<OsmBuilding[]>) {
  vi.stubGlobal("fetch", fakeFetch);
  localStorage.setItem(
    "route-monitor.session",
    JSON.stringify({ accessToken: "t", refreshToken: "r", role: "MANAGER" }),
  );

  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthProvider>
        <BuildingFootprintSection buildingId="b1" fetchOsm={fetchOsm} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("BuildingFootprintSection", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("links the picked OSM outline to the building with a PUT", async () => {
    const fakeFetch = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            requestUrl(input).endsWith("/footprint") ? building(OSM[0]?.footprint) : [building()],
          ),
          { status: 200 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderSection(fakeFetch, () => Promise.resolve(OSM));

    await user.click(await screen.findByRole("button", { name: "Bloco CD (UFCG)" }));
    await user.click(screen.getByRole("button", { name: "Vincular a este prédio" }));

    await waitFor(() => {
      const put = fakeFetch.mock.calls.find(
        ([input]) => input instanceof Request && input.method === "PUT",
      );
      expect(put).toBeDefined();
    });
  });

  it("explains an OSM outage and offers a retry", async () => {
    const fakeFetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify([building()]), { status: 200 })),
    );
    renderSection(fakeFetch, () => Promise.reject(new Error("offline")));

    expect(await screen.findByText(/Não foi possível carregar os contornos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("removes a linked outline after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fakeFetch = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            requestUrl(input).endsWith("/footprint") ? building() : [building(OSM[0]?.footprint)],
          ),
          { status: 200 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderSection(fakeFetch, () => Promise.resolve(OSM));

    await user.click(await screen.findByRole("button", { name: "Remover contorno" }));

    await waitFor(() => {
      const del = fakeFetch.mock.calls.find(
        ([input]) => input instanceof Request && input.method === "DELETE",
      );
      expect(del).toBeDefined();
    });
  });

  it("keeps the saved outline's map and removal when Overpass fails", async () => {
    const fakeFetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify([building(OSM[0]?.footprint)]), { status: 200 })),
    );
    renderSection(fakeFetch, () => Promise.reject(new Error("offline")));

    expect(await screen.findByText(/Não foi possível carregar os contornos/)).toBeInTheDocument();
    expect(
      await screen.findByRole("region", { name: "Mapa para escolher o contorno do prédio" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover contorno" })).toBeInTheDocument();
  });

  it("replaces an existing outline with a PUT after picking another candidate", async () => {
    const fakeFetch = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            requestUrl(input).endsWith("/footprint")
              ? building(OSM[0]?.footprint)
              : [building(OSM[0]?.footprint)],
          ),
          { status: 200 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderSection(fakeFetch, () => Promise.resolve(OSM));

    await user.click(await screen.findByRole("button", { name: "Bloco CD (UFCG)" }));
    await user.click(screen.getByRole("button", { name: "Trocar contorno" }));

    await waitFor(() => {
      const put = fakeFetch.mock.calls.find(
        ([input]) => input instanceof Request && input.method === "PUT",
      );
      expect(put).toBeDefined();
    });
  });

  it("shows the server's reason instead of the raw JSON body when saving fails", async () => {
    const fakeFetch = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        requestUrl(input).endsWith("/footprint")
          ? new Response(JSON.stringify({ detail: "Building not found." }), { status: 404 })
          : new Response(JSON.stringify([building()]), { status: 200 }),
      ),
    );
    const user = userEvent.setup();
    renderSection(fakeFetch, () => Promise.resolve(OSM));

    await user.click(await screen.findByRole("button", { name: "Bloco CD (UFCG)" }));
    await user.click(screen.getByRole("button", { name: "Vincular a este prédio" }));

    expect(
      await screen.findByText("Não foi possível salvar o contorno: Building not found."),
    ).toBeInTheDocument();
  });
});
