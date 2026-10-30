import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { BuildingRoomsPanel } from "@/components/buildings/BuildingRoomsPanel";
import { FakeApi } from "@/test/fakeApi";

const BUILDING = {
  id: "b1",
  name: "Bloco CI",
  campus_area: "CCT",
  footprint: null,
  footprint_source: null,
  osm_way_id: null,
};
const FLOORS = [
  { id: "f1", building_id: "b1", label: "Térreo", level: 0 },
  { id: "f2", building_id: "b1", label: "1", level: 1 },
];

function panelApi(floors: unknown[] = FLOORS) {
  return new FakeApi()
    .on("GET", "/floors", floors)
    .on("GET", "/rooms", [])
    .on("GET", "/service-points", [])
    .on("GET", "/service-types", [])
    .install();
}

function renderPanel(onEditBuilding?: () => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BuildingRoomsPanel building={BUILDING} onEditBuilding={onEditBuilding} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("BuildingRoomsPanel", () => {
  it("is a region titled with the building, listing its floors in the API's order", async () => {
    const api = panelApi();

    renderPanel();

    const panel = screen.getByRole("region", { name: "Andares e salas · Bloco CI" });
    const floors = await within(panel).findAllByRole("group");
    expect(floors.map((floor) => floor.getAttribute("aria-label"))).toEqual(["Térreo", "1"]);
    expect(api.sent("GET", "/floors")[0]?.query.get("building_id")).toBe("b1");
    expect(api.sent("GET", "/rooms")[0]?.query.get("building_id")).toBe("b1");
  });

  it("says when the building has no floors yet", async () => {
    panelApi([]);

    renderPanel();

    expect(await screen.findByText(/Nenhum andar neste prédio/)).toBeInTheDocument();
  });

  it("shows a loading line while the floors load", () => {
    panelApi();

    renderPanel();

    expect(screen.getByText("Carregando andares e pontos…")).toBeInTheDocument();
  });

  it("says when the floors could not be loaded", async () => {
    panelApi().on("GET", "/floors", { detail: "boom" }, 500);

    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar");
  });

  it("creates a floor in this building without asking for a label", async () => {
    const api = panelApi().on("POST", "/floors", { ...FLOORS[1], id: "f3" }, 201);

    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Novo andar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/floors")[0]?.body).toEqual({ building_id: "b1" });
    });
    expect(screen.queryByLabelText("Rótulo do andar")).not.toBeInTheDocument();
  });

  it("says when the floor could not be created", async () => {
    panelApi().on("POST", "/floors", { detail: "boom" }, 500);

    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Novo andar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível cadastrar");
  });

  it("offers to edit the building only when the page asks for it", async () => {
    panelApi();
    let edited = 0;

    renderPanel(() => {
      edited += 1;
    });
    await userEvent.click(screen.getByRole("button", { name: "Editar Bloco CI" }));

    expect(edited).toBe(1);
  });
});
