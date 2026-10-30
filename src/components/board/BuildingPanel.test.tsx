import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { BuildingPanel } from "@/components/board/BuildingPanel";

const FLOORS = [
  { id: "f0", building_id: "b1", label: "Térreo", level: 0 },
  { id: "f1", building_id: "b1", label: "1º andar", level: 1 },
];
const POINTS = new Map([
  ["f0", [{ id: "p1", floor_id: "f0", name: "Banheiro térreo", latitude: -7.2, longitude: -35.9 }]],
  ["f1", [{ id: "p2", floor_id: "f1", name: "Sala 104", latitude: -7.2, longitude: -35.9 }]],
]);

// The header links to the building's registry page.
const inRouter = (panel: ReactElement) => <MemoryRouter>{panel}</MemoryRouter>;

function panelProps(overrides: Partial<Parameters<typeof BuildingPanel>[0]> = {}) {
  return {
    building: { id: "b1", name: "Bloco CD", campusArea: "CEEI" },
    floors: FLOORS,
    pointsByFloor: POINTS,
    statuses: new Map([["p1", "IN_PROGRESS" as const]]),
    selectedFloorId: "all" as const,
    onSelectFloor: vi.fn(),
    selectedPointId: null,
    onSelectPoint: vi.fn(),
    onClose: vi.fn(),
    isLoading: false,
    isError: false,
    ...overrides,
  };
}

function renderPanel(overrides: Partial<Parameters<typeof BuildingPanel>[0]> = {}) {
  const props = panelProps(overrides);
  render(inRouter(<BuildingPanel {...props} />));

  return props;
}

describe("BuildingPanel", () => {
  it("summarises today and lists each point with its status", () => {
    renderPanel();

    expect(screen.getByRole("heading", { name: "Bloco CD" })).toBeInTheDocument();
    expect(screen.getByText("2 pontos · 0 feitos")).toBeInTheDocument();
    const running = within(screen.getByRole("listitem", { name: /Banheiro térreo/ }));
    expect(running.getByText("Em andamento")).toBeInTheDocument();
    const idle = within(screen.getByRole("listitem", { name: /Sala 104/ }));
    expect(idle.getByText("Sem visita hoje")).toBeInTheDocument();
  });

  it("uses the singular forms for one point", () => {
    renderPanel({ floors: FLOORS.slice(0, 1), statuses: new Map([["p1", "DONE" as const]]) });

    expect(screen.getByText("1 ponto · 1 feito")).toBeInTheDocument();
  });

  it("switches floor and highlights a point", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole("tab", { name: "1º andar" }));
    await user.click(screen.getByRole("button", { name: /Banheiro térreo/ }));

    expect(props.onSelectFloor).toHaveBeenCalledWith("f1");
    expect(props.onSelectPoint).toHaveBeenCalledWith("p1");
  });

  it("lists only the selected floor's points", () => {
    renderPanel({ selectedFloorId: "f1" });

    expect(screen.queryByRole("listitem", { name: /Banheiro térreo/ })).not.toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: /Sala 104/ })).toBeInTheDocument();
  });

  it("goes back to the alerts with the back button or Escape", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole("button", { name: "Voltar aos alertas" }));
    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("says when the building has no floors", () => {
    renderPanel({ floors: [], pointsByFloor: new Map() });

    expect(screen.getByText("Nenhum andar cadastrado neste prédio.")).toBeInTheDocument();
  });

  it("says when loading fails", () => {
    renderPanel({ floors: undefined, isError: true });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os andares e pontos deste prédio.",
    );
  });

  it("ignores an Escape that a menu or dialog already consumed", () => {
    const props = renderPanel();
    const consumed = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    consumed.preventDefault();

    document.dispatchEvent(consumed);

    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("shows no summary line while floors load or after an error", () => {
    const { rerender } = render(inRouter(<BuildingPanel {...panelProps({ floors: undefined })} />));
    expect(screen.queryByText(/pontos · 0 feitos/)).not.toBeInTheDocument();

    rerender(inRouter(<BuildingPanel {...panelProps({ isError: true })} />));
    expect(screen.queryByText(/pontos · 0 feitos/)).not.toBeInTheDocument();
  });

  it("links to the building's page and tells each point's floor and purpose", () => {
    renderPanel({
      pointsByFloor: new Map([
        [
          "f0",
          [
            {
              id: "p1",
              floor_id: "f0",
              name: "Banheiro térreo",
              description: "Masculino",
              latitude: -7.2,
              longitude: -35.9,
            },
          ],
        ],
      ]),
    });

    expect(screen.getByRole("link", { name: "Abrir cadastro do prédio" })).toHaveAttribute(
      "href",
      "/predios?predio=b1",
    );
    expect(screen.getByText("Térreo · Masculino")).toBeInTheDocument();
  });
});
