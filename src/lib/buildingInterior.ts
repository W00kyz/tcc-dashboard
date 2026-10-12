// src/lib/buildingInterior.ts
import type { components } from "@/api/generated/schema";
import { toStopStatus } from "@/lib/stopStatus";

type RouteOut = components["schemas"]["RouteOut"];
type Ring = [number, number][];

export type PointVisitStatus = "LATE" | "IN_PROGRESS" | "PENDING" | "DONE" | "NOT_SCHEDULED";

// Lower = more urgent; when two routes visit one point the panel shows the more urgent one.
const URGENCY: Record<PointVisitStatus, number> = {
  LATE: 0,
  IN_PROGRESS: 1,
  PENDING: 2,
  DONE: 3,
  NOT_SCHEDULED: 4,
};

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// Drops hull tops that would make a non-left turn toward `point` (the monotone-chain rule).
function popNonLeftTurns(hull: Ring, point: [number, number]): void {
  let below = hull.at(-2);
  let top = hull.at(-1);
  while (below !== undefined && top !== undefined && cross(below, top, point) <= 0) {
    hull.pop();
    below = hull.at(-2);
    top = hull.at(-1);
  }
}

function halfHull(points: Ring): Ring {
  const hull: Ring = [];
  for (const point of points) {
    popNonLeftTurns(hull, point);
    hull.push(point);
  }
  hull.pop();

  return hull;
}

/** Monotone-chain convex hull as a closed GeoJSON ring; null below three distinct points.
 * @example convexHull(points.map((p) => [p.longitude, p.latitude])) */
export function convexHull(points: Ring): Ring | null {
  const unique = [...new Map(points.map((p) => [`${String(p[0])},${String(p[1])}`, p])).values()];
  if (unique.length < 3) {
    return null;
  }
  const sorted = unique.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const hull = [...halfHull(sorted), ...halfHull([...sorted].reverse())];
  const first = hull.at(0);
  if (hull.length < 3 || first === undefined) {
    return null;
  }

  return [...hull, first];
}

function stopVisitStatus(route: RouteOut, stopIndex: number, delayed: boolean): PointVisitStatus {
  const status = toStopStatus(route.stops[stopIndex]?.status ?? "PENDING");
  const currentIndex = route.stops.findIndex((stop) => toStopStatus(stop.status) !== "DONE");
  if (delayed && stopIndex === currentIndex) {
    return "LATE";
  }

  return status;
}

/** Today's status per service point, from the day's routes; the most urgent visit wins.
 * @example pointStatusesForToday(dayRoutes, delayedRouteIds).get(pointId) */
export function pointStatusesForToday(
  routes: RouteOut[],
  delayedRouteIds: Set<string>,
): Map<string, PointVisitStatus> {
  const statuses = new Map<string, PointVisitStatus>();
  for (const route of routes.filter((candidate) => candidate.status !== "CANCELLED")) {
    route.stops.forEach((stop, index) => {
      const next = stopVisitStatus(route, index, delayedRouteIds.has(route.id));
      const previous = statuses.get(stop.service_point_id);
      if (previous === undefined || URGENCY[next] < URGENCY[previous]) {
        statuses.set(stop.service_point_id, next);
      }
    });
  }

  return statuses;
}

/** Header numbers of the building panel. @example summarisePoints([...statuses.values()]) */
export function summarisePoints(statuses: PointVisitStatus[]): {
  total: number;
  done: number;
  late: number;
} {
  return {
    total: statuses.length,
    done: statuses.filter((status) => status === "DONE").length,
    late: statuses.filter((status) => status === "LATE").length,
  };
}
