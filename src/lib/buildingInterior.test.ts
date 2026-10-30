// src/lib/buildingInterior.test.ts
import { describe, expect, it } from "vitest";

import type { components } from "@/api/generated/schema";
import {
  placeStatusesForToday,
  pointStatusesForToday,
  summarisePoints,
} from "@/lib/buildingInterior";

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
  it("reads each visited point's status off its stop", () => {
    const statuses = pointStatusesForToday([
      route("r1", [
        ["p1", "DONE"],
        ["p2", "PENDING"],
      ]),
    ]);

    expect(statuses.get("p1")).toBe("DONE");
    expect(statuses.get("p2")).toBe("PENDING");
  });

  it("keeps the most urgent status when two routes visit the same point", () => {
    const statuses = pointStatusesForToday([
      route("r1", [["p1", "DONE"]]),
      route("r2", [["p1", "IN_PROGRESS"]]),
    ]);

    expect(statuses.get("p1")).toBe("IN_PROGRESS");
  });

  it("ignores a released stop: the point is back in the pool, not visited", () => {
    const statuses = pointStatusesForToday([
      route("r1", [["p1", "RELEASED"]]),
      route("r2", [["p2", "RELEASED"]]),
      route("r3", [["p2", "IN_PROGRESS"]]),
    ]);

    expect(statuses.has("p1")).toBe(false);
    expect(statuses.get("p2")).toBe("IN_PROGRESS");
  });
});

describe("summarisePoints", () => {
  it("counts points and done ones", () => {
    expect(summarisePoints(["DONE", "IN_PROGRESS", "PENDING", "NOT_SCHEDULED"])).toEqual({
      total: 4,
      done: 1,
    });
  });
});

function placeRoute(id: string, stops: [string | null, string][]): RouteOut {
  return {
    id,
    status: "IN_PROGRESS",
    stops: stops.map(([placeId, status], index) => ({
      id: `${id}-${String(index)}`,
      order_index: index + 1,
      status,
      service_point_id: `${id}-point-${String(index)}`,
      place_id: placeId,
    })),
  } as unknown as RouteOut;
}

describe("placeStatusesForToday", () => {
  it("reads a place's status off the stops that carry its id, the most urgent winning", () => {
    const statuses = placeStatusesForToday([
      placeRoute("r1", [
        ["pl1", "DONE"],
        ["pl1", "PENDING"],
        ["pl2", "DONE"],
      ]),
    ]);

    expect(statuses.get("pl1")).toBe("PENDING");
    expect(statuses.get("pl2")).toBe("DONE");
  });

  it("leaves building stops out: they carry no place id", () => {
    const statuses = placeStatusesForToday([placeRoute("r1", [[null, "PENDING"]])]);

    expect(statuses.size).toBe(0);
  });

  it("shows RELEASED only when nothing else of the place is on the board", () => {
    const statuses = placeStatusesForToday([
      placeRoute("r1", [
        ["pl1", "RELEASED"],
        ["pl2", "RELEASED"],
      ]),
      placeRoute("r2", [["pl2", "IN_PROGRESS"]]),
    ]);

    expect(statuses.get("pl1")).toBe("RELEASED");
    expect(statuses.get("pl2")).toBe("IN_PROGRESS");
  });
});
