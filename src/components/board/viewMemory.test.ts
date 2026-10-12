import { describe, expect, it } from "vitest";

import { nextViewAction } from "@/components/board/viewMemory";

describe("nextViewAction", () => {
  it("captures the view when a building opens from nothing", () => {
    expect(nextViewAction(null, "a")).toBe("capture");
  });

  it("restores the view when the open building closes", () => {
    expect(nextViewAction("a", null)).toBe("restore");
  });

  it("keeps the first captured view when switching between buildings", () => {
    expect(nextViewAction("a", "b")).toBe("keep");
  });

  it("does nothing while nothing is open, so an empty-map click never flies back", () => {
    expect(nextViewAction(null, null)).toBe("keep");
  });

  it("does nothing when the same building stays open", () => {
    expect(nextViewAction("a", "a")).toBe("keep");
  });
});
