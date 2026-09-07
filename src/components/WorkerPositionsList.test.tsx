import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { components } from "@/api/generated/schema";
import { WorkerPositionsList } from "@/components/WorkerPositionsList";

type BoardPosition = components["schemas"]["BoardPosition"];

function position(overrides: Partial<BoardPosition> = {}): BoardPosition {
  return {
    field_worker_id: "w1",
    field_worker_name: "Ana Lima",
    latitude: -7.213456,
    longitude: -35.907891,
    reported_at: "2026-09-07T12:00:00Z",
    age_seconds: 120,
    ...overrides,
  };
}

describe("WorkerPositionsList", () => {
  it("renders one row per position with the name, formatted coords and age", () => {
    render(
      <WorkerPositionsList
        positions={[
          position({ field_worker_id: "w1", field_worker_name: "Ana Lima", age_seconds: 30 }),
          position({
            field_worker_id: "w2",
            field_worker_name: "Bruno Sá",
            age_seconds: 300,
          }),
          position({
            field_worker_id: "w3",
            field_worker_name: "Célia Rocha",
            age_seconds: 7200,
          }),
        ]}
      />,
    );

    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3 data rows

    const anaRow = screen.getByRole("row", { name: /Ana Lima/ });
    expect(within(anaRow).getByText("-7.21346, -35.90789")).toBeInTheDocument();
    expect(within(anaRow).getByText("agora")).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /Bruno Sá/ })).getByText("há 5 min"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("row", { name: /Célia Rocha/ })).getByText("há 2 h"),
    ).toBeInTheDocument();
  });

  it("shows the empty state when there are no positions", () => {
    render(<WorkerPositionsList positions={[]} />);

    expect(screen.getByText("Nenhuma posição reportada")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
