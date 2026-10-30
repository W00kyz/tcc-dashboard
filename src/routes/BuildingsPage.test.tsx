import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { BuildingsPage } from "@/routes/BuildingsPage";
import { DRAWN_RECTANGLE } from "@/test/FakeCampusBuildingsMap";
import { FakeApi } from "@/test/fakeApi";

vi.mock("@/components/buildings/CampusBuildingsMap", async () => ({
  CampusBuildingsMap: (await import("@/test/FakeCampusBuildingsMap")).FakeCampusBuildingsMap,
}));

const SQUARE = {
  type: "Polygon",
  coordinates: [
    [
      [-35.91, -7.21],
      [-35.9, -7.21],
      [-35.9, -7.22],
      [-35.91, -7.21],
    ],
  ],
};

function building(id: string, name: string, footprint: unknown = null) {
  return { id, name, campus_area: "CCT", footprint, footprint_source: null, osm_way_id: null };
}

const POINT = {
  id: "p1",
  floor_id: "f1",
  name: "Sala 101",
  description: "Sala de aula",
  latitude: -7.215,
  longitude: -35.905,
  service_type_id: "t1",
  service_type_name: "Limpeza",
};
function serviceType(id: string, name: string, company: string | null) {
  return {
    id,
    name,
    average_duration_minutes: 30,
    contractor_company_id: company === null ? null : `co-${company}`,
    contractor_company_name: company,
  };
}
const IMPACT = { points: 1, floors: 2, rooms: 0, routes: 1, executions: 3, photos: 2, appeals: 1 };

function campusApi() {
  return new FakeApi()
    .on("GET", "/buildings", [building("b1", "Bloco CI", SQUARE), building("b2", "Bloco CEEI")])
    .on("GET", "/floors", [
      { id: "f1", building_id: "b1", label: "Térreo" },
      { id: "f2", building_id: "b1", label: "1º andar" },
    ])
    .on("GET", "/rooms", [])
    .on("GET", "/service-points", [POINT])
    .on("GET", "/service-types", [
      serviceType("t1", "Limpeza", "Limpa Tudo"),
      serviceType("t2", "Jardinagem", "Verde Jardins"),
      serviceType("t9", "Pintura", null),
    ])
    .install();
}

function CurrentSearch() {
  return <p data-testid="search">{useLocation().search}</p>;
}

function renderPage(path = "/predios", retry: number | false = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry, retryDelay: 0 } } });

  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Routes>
            <Route
              path="/predios"
              element={
                <>
                  <BuildingsPage />
                  <CurrentSearch />
                </>
              }
            />
          </Routes>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const map = () => screen.getByRole("region", { name: "mapa dos prédios" });
const selectBlocoCI = async () => {
  await userEvent.click(await within(map()).findByRole("button", { name: "Bloco CI" }));
};
const roomsPanel = () => screen.getByRole("region", { name: /Andares e salas/ });

describe("BuildingsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows nothing below the map until a building is selected", async () => {
    campusApi();

    renderPage();

    expect(await within(map()).findByRole("button", { name: "Bloco CI" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Andares e salas/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "popup do prédio selecionado" })).toBeNull();
  });

  it("selecting a building shows its card on the map and its floors below", async () => {
    campusApi();

    renderPage();
    await selectBlocoCI();

    const card = screen.getByRole("group", { name: "popup do prédio selecionado" });
    expect(within(card).getByText("Bloco CI")).toBeInTheDocument();
    expect(await within(card).findByText("2 andares · 1 ponto")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Editar Bloco CI" })).toBeInTheDocument();
    const floors = await within(roomsPanel()).findAllByRole("group");
    expect(floors.map((floor) => floor.getAttribute("aria-label"))).toEqual(["Térreo", "1º andar"]);
    expect(screen.getByRole("region", { name: "Andares e salas · Bloco CI" })).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent("?predio=b1");
  });

  it("clicking outside the buildings clears the selection", async () => {
    campusApi();

    renderPage();
    await selectBlocoCI();
    await userEvent.click(within(map()).getByRole("button", { name: "clicar fora dos prédios" }));

    expect(screen.queryByRole("region", { name: /Andares e salas/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "popup do prédio selecionado" })).toBeNull();
  });

  it("opens a building given in the address (old links land here)", async () => {
    campusApi();

    renderPage("/predios?predio=b1");

    const panel = await screen.findByRole("region", { name: /Andares e salas/ });
    expect(await within(panel).findByRole("group", { name: "Térreo" })).toBeInTheDocument();
  });

  it("the pencil opens the building's edit dialog with its data but no floors", async () => {
    const api = campusApi().on("PATCH", "/buildings/b1", building("b1", "Bloco CI 2", SQUARE));

    renderPage();
    await selectBlocoCI();
    await userEvent.click(screen.getByRole("button", { name: "Editar Bloco CI" }));

    const dialog = screen.getByRole("dialog", { name: "Editar prédio" });
    expect(within(dialog).queryByRole("heading", { name: /Andares/ })).toBeNull();
    expect(within(dialog).queryByText("1º andar")).toBeNull();
    const name = within(dialog).getByLabelText("Nome", { selector: "#building-name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Bloco CI 2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(api.sent("PATCH", "/buildings/b1")[0]?.body).toEqual({
        name: "Bloco CI 2",
        campus_area: "CCT",
      });
    });
  });

  it("removes a building from its dialog and clears the selection", async () => {
    const api = campusApi()
      .on("GET", "/buildings/b1/deletion-impact", IMPACT)
      .on("DELETE", "/buildings/b1", null, 204);

    renderPage();
    await selectBlocoCI();
    await userEvent.click(screen.getByRole("button", { name: "Editar Bloco CI" }));
    await userEvent.click(screen.getByRole("button", { name: "Remover prédio" }));
    const dialog = screen.getByRole("dialog", { name: "Remover Bloco CI?" });
    expect(await within(dialog).findByText("2 andares")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remover" }));

    await waitFor(() => {
      expect(api.sent("DELETE", "/buildings/b1")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: /Andares e salas/ })).toBeNull();
    });
  });

  it("redraws a building's outline with the rectangle and confirms it in the popup", async () => {
    const api = campusApi().on("PUT", "/buildings/b1/footprint", building("b1", "Bloco CI"));

    renderPage();
    await selectBlocoCI();
    await userEvent.click(screen.getByRole("button", { name: "Editar Bloco CI" }));
    await userEvent.click(screen.getByRole("button", { name: "Redesenhar contorno" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/novo contorno de Bloco CI/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "arrastar um retângulo no mapa" }));
    const popup = screen.getByRole("group", { name: "popup do prédio desenhado" });
    await userEvent.click(within(popup).getByRole("button", { name: "Substituir contorno" }));

    await waitFor(() => {
      expect(api.sent("PUT", "/buildings/b1/footprint")[0]?.body).toEqual({
        footprint: DRAWN_RECTANGLE,
      });
    });
  });

  it("draws a building as a rectangle and registers it from the popup", async () => {
    const api = campusApi().on("POST", "/buildings", building("b3", "CEEI", DRAWN_RECTANGLE), 201);

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Desenhar prédio" }));
    await userEvent.click(screen.getByRole("button", { name: "arrastar um retângulo no mapa" }));
    const popup = screen.getByRole("group", { name: "popup do prédio desenhado" });
    await userEvent.type(within(popup).getByLabelText("Nome"), "CEEI");
    await userEvent.type(within(popup).getByLabelText("Área do campus"), "CCT");
    await userEvent.click(within(popup).getByRole("button", { name: "Cadastrar" }));

    // The new building is selected right away: its card and (empty) floor list show.
    await waitFor(() => {
      expect(screen.getByTestId("search")).toHaveTextContent("?predio=b3");
    });
    expect(api.sent("POST", "/buildings")[0]?.body).toEqual({
      name: "CEEI",
      campus_area: "CCT",
      footprint: DRAWN_RECTANGLE,
    });
  });

  it("counts the Térreo of a building just created on its card", async () => {
    const buildings = [building("b1", "Bloco CI", SQUARE)];
    const floors = [{ id: "f1", building_id: "b1", label: "Térreo", level: 0 }];
    const api = campusApi()
      .onRequest("GET", "/buildings", () => buildings)
      .onRequest("GET", "/floors", () => floors)
      .onRequest(
        "POST",
        "/buildings",
        () => {
          const created = building("b3", "CEEI", DRAWN_RECTANGLE);
          buildings.push(created);
          // The server gives every new building its ground floor.
          floors.push({ id: "f9", building_id: "b3", label: "Térreo", level: 0 });

          return created;
        },
        201,
      );

    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Desenhar prédio" }));
    await userEvent.click(screen.getByRole("button", { name: "arrastar um retângulo no mapa" }));
    const popup = screen.getByRole("group", { name: "popup do prédio desenhado" });
    await userEvent.type(within(popup).getByLabelText("Nome"), "CEEI");
    await userEvent.type(within(popup).getByLabelText("Área do campus"), "CCT");
    await userEvent.click(within(popup).getByRole("button", { name: "Cadastrar" }));

    const card = await screen.findByRole("group", { name: "popup do prédio selecionado" });
    expect(await within(card).findByText("1 andar · 0 pontos")).toBeInTheDocument();
    expect(api.sent("GET", "/floors").length).toBeGreaterThan(1);
  });

  it("throws the drawing away when the popup is cancelled", async () => {
    const api = campusApi();

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Desenhar prédio" }));
    await userEvent.click(screen.getByRole("button", { name: "arrastar um retângulo no mapa" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("group", { name: "popup do prédio desenhado" })).toBeNull();
    expect(api.sent("POST", "/buildings")).toHaveLength(0);
  });

  it("selects any building from the picker, and one with nothing to draw from its link", async () => {
    campusApi();

    renderPage();
    const picker = screen.getByLabelText("Ir para o prédio");
    await within(picker).findByRole("option", { name: "Bloco CEEI" });
    await userEvent.selectOptions(picker, "b1");
    expect(screen.getByTestId("search")).toHaveTextContent("?predio=b1");

    const offMap = await screen.findByText(/ainda sem área no mapa/);
    await userEvent.click(within(offMap).getByRole("button", { name: "Bloco CEEI" }));
    expect(screen.getByTestId("search")).toHaveTextContent("?predio=b2");
    // A building off the map has no card to edit it from: the panel carries the pencil.
    expect(
      await within(roomsPanel()).findByRole("button", { name: "Editar Bloco CEEI" }),
    ).toBeInTheDocument();
  });

  // Regression: an expired token's 401 on /floors used to read as "no floors", so every building
  // fell off the map until a reload. Failing the query lets it retry after the token refresh.
  it("keeps the buildings on the map when a list first fails with 401", async () => {
    let floorCalls = 0;
    campusApi().onRequest("GET", "/floors", () => {
      floorCalls += 1;

      return floorCalls === 1
        ? new Response(JSON.stringify({ detail: "expired" }), { status: 401 })
        : [{ id: "f1", building_id: "b2", label: "Térreo" }];
    });

    renderPage("/predios", 1);

    expect(await within(map()).findByRole("button", { name: "Bloco CI" })).toBeInTheDocument();
    await waitFor(() => {
      expect(floorCalls).toBeGreaterThanOrEqual(2);
    });
  });
});
