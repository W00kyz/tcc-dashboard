import { describe, expect, it } from "vitest";

import { isOutsideCampus } from "./placeErrors";

describe("isOutsideCampus", () => {
  it("recognises the OUTSIDE_CAMPUS code", () => {
    expect(isOutsideCampus({ detail: { code: "OUTSIDE_CAMPUS" } })).toBe(true);
  });

  it("is false for another code", () => {
    expect(isOutsideCampus({ detail: { code: "OTHER" } })).toBe(false);
  });

  it("is false for a plain string detail", () => {
    expect(isOutsideCampus({ detail: "not found" })).toBe(false);
  });

  it.each([null, undefined, {}, { detail: null }])(
    "is false, and does not throw, for %j",
    (error) => {
      expect(isOutsideCampus(error)).toBe(false);
    },
  );
});
