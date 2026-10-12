import { describe, expect, it } from "vitest";

import { mapBuildingsFrom } from "@/components/board/BuildingsLayer";

describe("mapBuildingsFrom", () => {
  it("uses the OSM footprint, falls back to the point hull, and omits buildings it cannot outline", () => {
    const square: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const buildings = mapBuildingsFrom(
      [
        {
          id: "osm",
          name: "A",
          campus_area: "",
          footprint: { type: "Polygon", coordinates: [square] },
          footprint_source: "osm",
          osm_way_id: 1,
        },
        {
          id: "hull",
          name: "B",
          campus_area: "",
          footprint: null,
          footprint_source: null,
          osm_way_id: null,
        },
        {
          id: "none",
          name: "C",
          campus_area: "",
          footprint: null,
          footprint_source: null,
          osm_way_id: null,
        },
      ],
      new Map([
        [
          "hull",
          [
            [0, 0],
            [2, 0],
            [2, 2],
          ],
        ],
        ["none", [[0, 0]]],
      ]),
    );

    expect(buildings.map((b) => [b.id, b.approximate])).toEqual([
      ["osm", false],
      ["hull", true],
    ]);
  });
});
