import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { components } from "@/api/generated/schema";
import { WorkerPositionsMap } from "@/components/WorkerPositionsMap";

type BoardPosition = components["schemas"]["BoardPosition"];

function position(name: string, ageSeconds: number): BoardPosition {
  return {
    field_worker_id: name,
    field_worker_name: name,
    latitude: -7.2147,
    longitude: -35.9094,
    reported_at: "2026-10-10T12:00:00Z",
    age_seconds: ageSeconds,
  };
}

describe("WorkerPositionsMap (RF42)", () => {
  it("renders the map region with a labelled marker per worker", () => {
    render(<WorkerPositionsMap positions={[position("João", 30), position("Maria", 3600)]} />);

    const region = screen.getByRole("region", { name: /mapa das posições/i });
    expect(region.querySelectorAll(".leaflet-interactive")).toHaveLength(2);
    expect(screen.getByText("João")).toBeInTheDocument();
    expect(screen.getByText("Maria")).toBeInTheDocument();
  });

  it("redraws the markers when the snapshot changes", () => {
    const { rerender } = render(<WorkerPositionsMap positions={[position("João", 30)]} />);

    rerender(<WorkerPositionsMap positions={[]} />);

    expect(screen.queryByText("João")).not.toBeInTheDocument();
  });
});
