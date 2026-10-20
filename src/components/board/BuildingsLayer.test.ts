import { describe, expect, it } from "vitest";

import { mapBuildingsFrom } from "@/components/board/BuildingsLayer";

describe("mapBuildingsFrom", () => {
  it("draws a building by its outline and leaves out one without it", () => {
    const square: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const buildings = mapBuildingsFrom([
      {
        id: "outlined",
        name: "A",
        campus_area: "",
        footprint: { type: "Polygon", coordinates: [square] },
        footprint_source: "drawn",
        osm_way_id: null,
      },
      // Points share their building's location, so they cannot outline it any more: no hull.
      {
        id: "legacy",
        name: "B",
        campus_area: "",
        footprint: null,
        footprint_source: null,
        osm_way_id: null,
      },
    ]);

    expect(buildings).toEqual([{ id: "outlined", name: "A", outline: square }]);
  });
});
