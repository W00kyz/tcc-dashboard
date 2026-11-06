import { describe, expect, it } from "vitest";

import { campusBoxFrom } from "@/lib/campus";

const UFCG_BOX = { south: -7.218, west: -35.913, north: -7.211, east: -35.9045 };

describe("campusBoxFrom", () => {
  it("falls back to the UFCG campus box when nothing is configured", () => {
    expect(campusBoxFrom(undefined)).toEqual(UFCG_BOX);
    expect(campusBoxFrom("")).toEqual(UFCG_BOX);
  });

  it("parses south,west,north,east", () => {
    expect(campusBoxFrom("-7.26,-35.90,-7.25,-35.88")).toEqual({
      south: -7.26,
      west: -35.9,
      north: -7.25,
      east: -35.88,
    });
  });

  it("tolerates spaces around the numbers", () => {
    expect(campusBoxFrom(" -7.26 , -35.90 , -7.25 , -35.88 ")).toEqual({
      south: -7.26,
      west: -35.9,
      north: -7.25,
      east: -35.88,
    });
  });

  it("falls back to the UFCG box on malformed input", () => {
    for (const raw of ["abc", "1,2,3", "1,2,3,4,5", "1,2,x,4", "1,,3,4"]) {
      expect(campusBoxFrom(raw)).toEqual(UFCG_BOX);
    }
  });

  it("falls back when the box is upside down or off the globe", () => {
    expect(campusBoxFrom("-7.25,-35.90,-7.26,-35.88")).toEqual(UFCG_BOX);
    expect(campusBoxFrom("-7.26,-35.88,-7.25,-35.90")).toEqual(UFCG_BOX);
    expect(campusBoxFrom("-95,-35.90,-7.25,-35.88")).toEqual(UFCG_BOX);
  });
});
