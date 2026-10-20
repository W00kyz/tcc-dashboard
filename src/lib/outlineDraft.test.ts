import { describe, expect, it } from "vitest";

import type { GeoPolygon } from "@/lib/osmBuildings";
import { rectangleOutline } from "@/lib/outlineDraft";

const SQUARE: GeoPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [-35.91, -7.21],
      [-35.9, -7.21],
      [-35.9, -7.22],
      [-35.91, -7.22],
      [-35.91, -7.21],
    ],
  ],
};

describe("rectangleOutline", () => {
  it("turns the two dragged corners into the closed rectangle the backend stores", () => {
    expect(rectangleOutline([-35.91, -7.21], [-35.9, -7.22])).toEqual(SQUARE);
  });

  it("is the same rectangle whichever way it was dragged", () => {
    expect(rectangleOutline([-35.9, -7.22], [-35.91, -7.21])).toEqual(SQUARE);
  });

  it("refuses a drag with no area (a plain click)", () => {
    expect(rectangleOutline([-35.91, -7.21], [-35.91, -7.21])).toBeNull();
    expect(rectangleOutline([-35.91, -7.21], [-35.91, -7.22])).toBeNull();
  });
});
