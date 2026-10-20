// src/lib/buildingInterior.test.ts
import { describe, expect, it } from "vitest";

import type { components } from "@/api/generated/schema";
import { pointStatusesForToday, summarisePoints } from "@/lib/buildingInterior";

type RouteOut = components["schemas"]["RouteOut"];

function route(id: string, stops: [string, string][]): RouteOut {
  return {
    id,
    status: "IN_PROGRESS",
    stops: stops.map(([pointId, status], index) => ({
      id: `${id}-${String(index)}`,
      order_index: index + 1,
      status,
      service_point_id: pointId,
    })),
  } as unknown as RouteOut;
}

describe("pointStatusesForToday", () => {
  it("marks the current stop of a delayed route as late", () => {
    const statuses = pointStatusesForToday(
      [
        route("r1", [
          ["p1", "DONE"],
          ["p2", "PENDING"],
        ]),
      ],
      new Set(["r1"]),
    );

    expect(statuses.get("p1")).toBe("DONE");
    expect(statuses.get("p2")).toBe("LATE");
  });

  it("keeps the most urgent status when two routes visit the same point", () => {
    const statuses = pointStatusesForToday(
      [route("r1", [["p1", "DONE"]]), route("r2", [["p1", "IN_PROGRESS"]])],
      new Set(),
    );

    expect(statuses.get("p1")).toBe("IN_PROGRESS");
  });
});

describe("summarisePoints", () => {
  it("counts points, done and late", () => {
    expect(summarisePoints(["DONE", "LATE", "PENDING", "NOT_SCHEDULED"])).toEqual({
      total: 4,
      done: 1,
      late: 1,
    });
  });
});
