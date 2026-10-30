import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { PlacePanel, type PlacePanelProps } from "@/components/board/PlacePanel";

const POINTS: PlacePanelProps["points"] = [
  {
    id: "s1",
    name: "Limpeza",
    description: "Lixeiras",
    service_type_name: "Limpeza",
    active: true,
  },
  { id: "s2", name: "Jardim", description: "", service_type_name: "Jardinagem", active: false },
];

function renderPanel(overrides: Partial<PlacePanelProps> = {}) {
  const props: PlacePanelProps = {
    place: { id: "pl1", name: "Praça central" },
    points: POINTS,
    statuses: new Map([["s1", "DONE" as const]]),
    isLoading: false,
    isError: false,
    onClose: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <PlacePanel {...props} />
    </MemoryRouter>,
  );

  return props;
}

describe("PlacePanel", () => {
  it("names the place, summarises today and lists each service with its state", () => {
    renderPanel();

    expect(screen.getByRole("heading", { name: "Praça central" })).toBeInTheDocument();
    expect(screen.getByText("2 serviços · 1 feito")).toBeInTheDocument();
    const done = within(screen.getByRole("listitem", { name: /Limpeza/ }));
    expect(done.getByText("Feito")).toBeInTheDocument();
    const idle = within(screen.getByRole("listitem", { name: /Jardinagem/ }));
    expect(idle.getByText("Sem visita hoje")).toBeInTheDocument();
  });

  it("marks an inactive service", () => {
    renderPanel();

    expect(
      within(screen.getByRole("listitem", { name: /Jardinagem/ })).getByText("Inativo"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("listitem", { name: /Limpeza/ })).queryByText("Inativo"),
    ).not.toBeInTheDocument();
  });

  it("links to the place's registry card", () => {
    renderPanel();

    expect(screen.getByRole("link", { name: "Abrir cadastro do local" })).toHaveAttribute(
      "href",
      "/predios?local=pl1",
    );
  });

  it("goes back to the alerts with the back button or Escape", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole("button", { name: "Voltar aos alertas" }));
    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("says when the place has no services", () => {
    renderPanel({ points: [] });
    expect(screen.getByText("Nenhum serviço neste local.")).toBeInTheDocument();
  });

  it("shows no summary and an alert when loading fails", () => {
    renderPanel({ points: undefined, isError: true });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os serviços deste local.",
    );
    expect(screen.queryByText(/feito/)).not.toBeInTheDocument();
  });
});
