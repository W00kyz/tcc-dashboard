// src/lib/buildingInterior.test.ts
import { describe, expect, it } from "vitest";

import type { components } from "@/api/generated/schema";
import { convexHull, pointStatusesForToday, summarisePoints } from "@/lib/buildingInterior";

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

describe("convexHull", () => {
  it("wraps the outer points in a closed ring and ignores the inner ones", () => {
    const ring = convexHull([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [1, 1],
    ]);

    expect(ring).toHaveLength(5);
    expect(ring?.[0]).toEqual(ring?.[4]);
    expect(ring).not.toContainEqual([1, 1]);
  });

  it("returns null with fewer than three distinct points", () => {
    expect(
      convexHull([
        [0, 0],
        [0, 0],
        [1, 1],
      ]),
    ).toBeNull();
  });
});

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
