import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RouteStopStrip } from "@/components/RouteStopStrip";

describe("RouteStopStrip", () => {
  it("renders one dot per stop, labeled by its status", () => {
    render(
      <RouteStopStrip
        stops={[
          { id: "1", orderIndex: 1, status: "DONE" },
          { id: "2", orderIndex: 2, status: "PENDING" },
        ]}
      />,
    );

    expect(screen.getByLabelText("Ponto 1: Concluído")).toBeInTheDocument();
    expect(screen.getByLabelText("Ponto 2: Pendente")).toBeInTheDocument();
  });

  it("renders nothing when there are no stops", () => {
    render(<RouteStopStrip stops={[]} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
