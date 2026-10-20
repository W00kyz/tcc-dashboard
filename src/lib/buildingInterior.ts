// src/lib/buildingInterior.ts
import type { components } from "@/api/generated/schema";
import { toStopStatus } from "@/lib/stopStatus";

type RouteOut = components["schemas"]["RouteOut"];

export type PointVisitStatus = "LATE" | "IN_PROGRESS" | "PENDING" | "DONE" | "NOT_SCHEDULED";

// Lower = more urgent; when two routes visit one point the panel shows the more urgent one.
const URGENCY: Record<PointVisitStatus, number> = {
  LATE: 0,
  IN_PROGRESS: 1,
  PENDING: 2,
  DONE: 3,
  NOT_SCHEDULED: 4,
};

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
