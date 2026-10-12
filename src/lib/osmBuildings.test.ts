import { describe, expect, it } from "vitest";

import { CAMPUS_BBOX } from "@/lib/campus";
import { buildOverpassQuery, parseOverpassBuildings } from "@/lib/osmBuildings";

const RING = [
  { lat: -7.214, lon: -35.909 },
  { lat: -7.214, lon: -35.908 },
  { lat: -7.215, lon: -35.908 },
  { lat: -7.214, lon: -35.909 },
];

describe("buildOverpassQuery", () => {
  it("asks for building ways inside the campus box with their geometry", () => {
    const query = buildOverpassQuery(CAMPUS_BBOX);

    expect(query).toContain('way["building"](-7.218,-35.913,-7.211,-35.9045)');
    expect(query).toContain("out geom");
  });
});

describe("parseOverpassBuildings", () => {
  it("turns each closed building way into a GeoJSON polygon with lon/lat order", () => {
    const [building] = parseOverpassBuildings({
      elements: [{ type: "way", id: 42, tags: { name: "Bloco CD (UFCG)" }, geometry: RING }],
    });

    expect(building?.osmWayId).toBe(42);
    expect(building?.name).toBe("Bloco CD (UFCG)");
    expect(building?.footprint.coordinates[0]?.[0]).toEqual([-35.909, -7.214]);
  });

  it("drops relations, ways without geometry, open rings and oversized rings", () => {
    const open = RING.slice(0, 3);
    const huge = Array.from({ length: 501 }, () => RING[0]);

    const buildings = parseOverpassBuildings({
      elements: [
        { type: "relation", id: 1, tags: {} },
        { type: "way", id: 2, tags: {} },
        { type: "way", id: 3, tags: {}, geometry: open },
        { type: "way", id: 4, tags: {}, geometry: huge },
        { type: "way", id: 5, tags: {}, geometry: RING },
      ],
    });

    expect(buildings.map((building) => building.osmWayId)).toEqual([5]);
  });

  it("returns an empty list for a response that is not an Overpass payload", () => {
    expect(parseOverpassBuildings(null)).toEqual([]);
    expect(parseOverpassBuildings({ elements: "x" })).toEqual([]);
  });
});
