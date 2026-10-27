import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RouteStopStrip } from "@/components/RouteStopStrip";

describe("RouteStopStrip", () => {
  it("renders one dot per stop, labeled by its status", () => {
    render(
      <RouteStopStrip
        stops={[
          { id: "1", orderIndex: 1, status: "DONE" },
          { id: "2", orderIndex: 2, status: "IN_PROGRESS" },
          { id: "3", orderIndex: 3, status: "PENDING" },
        ]}
      />,
    );

    expect(screen.getByLabelText("Ponto 1: Concluído")).toBeInTheDocument();
    expect(screen.getByLabelText("Ponto 2: Em andamento")).toBeInTheDocument();
    expect(screen.getByTitle("Em andamento")).toBeInTheDocument();
    expect(screen.getByLabelText("Ponto 3: Pendente")).toBeInTheDocument();
  });

  it("greys a released stop and gives the release reason as its tooltip", () => {
    render(
      <RouteStopStrip
        stops={[{ id: "1", orderIndex: 4, status: "RELEASED", releaseReason: "END_OF_DAY" }]}
      />,
    );

    const disc = screen.getByLabelText("Ponto 4: Liberado — Fim do expediente");
    expect(disc).toHaveAttribute("title", "Liberado — Fim do expediente");
    expect(disc).toHaveClass("opacity-60");
  });

  it("renders nothing when there are no stops", () => {
    render(<RouteStopStrip stops={[]} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
