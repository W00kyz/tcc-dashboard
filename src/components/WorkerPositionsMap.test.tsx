import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { components } from "@/api/generated/schema";
import { markerState, WorkerPositionsMap } from "@/components/WorkerPositionsMap";

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

function pick(list: NodeListOf<Element>, index: number): Element {
  const found = Array.from(list)[index];
  if (found === undefined) {
    throw new Error(
      `expected a map shape at index ${String(index)}; found ${String(list.length)} shapes.`,
    );
  }

  return found;
}

describe("WorkerPositionsMap (RF42)", () => {
  it("draws a marker per worker but keeps ordinary names off the map until hovered", () => {
    render(<WorkerPositionsMap positions={[position("João", 30), position("Maria", 3600)]} />);

    const region = screen.getByRole("region", { name: /mapa das posições/i });
    expect(region.querySelectorAll(".leaflet-interactive")).toHaveLength(2);
    expect(screen.queryByText("João")).not.toBeInTheDocument();
    expect(screen.queryByText("Maria")).not.toBeInTheDocument();
  });

  it("always labels the worker the manager selected", () => {
    render(
      <WorkerPositionsMap
        positions={[position("João", 30), position("Maria", 30)]}
        selectedWorkerId="Maria"
      />,
    );

    expect(screen.getByText("Maria")).toBeInTheDocument();
    expect(screen.queryByText("João")).not.toBeInTheDocument();
  });

  it("reports which worker's marker was clicked", () => {
    const picked: string[] = [];
    render(
      <WorkerPositionsMap
        positions={[position("João", 30)]}
        onSelectWorker={(workerId) => picked.push(workerId)}
      />,
    );

    const region = screen.getByRole("region", { name: /mapa das posições/i });
    const marker = region.querySelector(".leaflet-interactive");
    if (marker === null) {
      throw new Error("expected one interactive marker on the map; found none.");
    }
    fireEvent.click(marker);

    expect(picked).toEqual(["João"]);
  });

  // The "never zoom out past the campus" floor depends on real layout (jsdom measures every
  // box as 0×0), so it is checked in the browser; here, zooming in is offered.
  it("lets the manager zoom in on the campus", () => {
    render(<WorkerPositionsMap positions={[position("João", 30)]} />);

    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeInTheDocument();
  });

  it("redraws the markers when the snapshot changes", () => {
    const { rerender } = render(<WorkerPositionsMap positions={[position("João", 30)]} />);

    rerender(<WorkerPositionsMap positions={[]} />);

    const region = screen.getByRole("region", { name: /mapa das posições/i });
    expect(region.querySelectorAll(".leaflet-interactive")).toHaveLength(0);
  });

  it("labels a worker whose route is delayed as late on the map", () => {
    render(
      <WorkerPositionsMap
        positions={[position("João", 30), position("Maria", 30)]}
        delayedWorkerIds={new Set(["Maria"])}
      />,
    );

    expect(screen.getByText("Maria · atrasada")).toBeInTheDocument();
    expect(screen.queryByText("João")).not.toBeInTheDocument();
  });
});

describe("markerState", () => {
  it("puts a delayed route ahead of a stale fix", () => {
    expect(markerState(position("Ana", 3600), new Set(["Ana"]))).toBe("late");
  });

  it("greys out a fix older than the stale threshold", () => {
    expect(markerState(position("Ana", 3600), new Set())).toBe("stale");
    expect(markerState(position("Ana", 60), new Set())).toBe("live");
  });

  const BUILDING = {
    id: "b1",
    name: "Bloco CD",
    approximate: false,
    outline: [
      [-35.909, -7.214],
      [-35.908, -7.214],
      [-35.908, -7.215],
      [-35.909, -7.214],
    ] as [number, number][],
  };

  it("reports which building was clicked", () => {
    const picked: (string | null)[] = [];
    render(
      <WorkerPositionsMap
        positions={[]}
        buildings={[BUILDING]}
        onSelectBuilding={(id) => picked.push(id)}
      />,
    );

    const region = screen.getByRole("region", { name: /mapa das posições/i });
    const outline = region.querySelector(".leaflet-interactive");
    if (outline === null) {
      throw new Error(
        "expected the building outline to be drawn as an interactive shape; found none.",
      );
    }
    fireEvent.click(outline);

    expect(picked).toEqual(["b1"]);
  });

  it("names a selected building on the map", () => {
    render(<WorkerPositionsMap positions={[]} buildings={[BUILDING]} selectedBuildingId="b1" />);

    expect(screen.getByText("Bloco CD")).toBeInTheDocument();
  });

  it("keeps the open building when a worker is clicked", () => {
    const picked: (string | null)[] = [];
    render(
      <WorkerPositionsMap
        positions={[position("João", 30)]}
        buildings={[BUILDING]}
        selectedBuildingId="b1"
        onSelectBuilding={(id) => picked.push(id)}
      />,
    );

    const region = screen.getByRole("region", { name: /mapa das posições/i });
    const shapes = region.querySelectorAll(".leaflet-interactive");
    fireEvent.click(pick(shapes, shapes.length - 1));

    expect(picked).toEqual([]);
  });

  it("clears the building selection when the empty map is clicked", () => {
    const picked: (string | null)[] = [];
    render(<WorkerPositionsMap positions={[]} onSelectBuilding={(id) => picked.push(id)} />);

    fireEvent.click(screen.getByRole("region", { name: /mapa das posições/i }));

    expect(picked).toEqual([null]);
  });
});
