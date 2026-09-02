import { describe, expect, it } from "vitest";

import { toStopStatus } from "./stopStatus";

describe("toStopStatus", () => {
  it("passes known values through", () => {
    expect(toStopStatus("IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(toStopStatus("DONE")).toBe("DONE");
    expect(toStopStatus("PENDING")).toBe("PENDING");
  });

  it("folds unknown values to PENDING", () => {
    expect(toStopStatus("WAT")).toBe("PENDING");
  });
});
