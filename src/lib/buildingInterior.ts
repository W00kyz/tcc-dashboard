// src/lib/buildingInterior.ts
import type { components } from "@/api/generated/schema";
import { toStopStatus } from "@/lib/stopStatus";

type RouteOut = components["schemas"]["RouteOut"];

export type PointVisitStatus = "IN_PROGRESS" | "PENDING" | "DONE" | "NOT_SCHEDULED";

// Lower = more urgent; when two routes visit one point the panel shows the more urgent one.
const URGENCY: Record<PointVisitStatus, number> = {
  IN_PROGRESS: 0,
  PENDING: 1,
  DONE: 2,
  NOT_SCHEDULED: 3,
};

/** Today's status per service point, from the day's routes; the most urgent visit wins. A stop
 * released back to the pool is no visit at all: the point waits for somebody's next batch.
 * @example pointStatusesForToday(dayRoutes).get(pointId) */
export function pointStatusesForToday(routes: RouteOut[]): Map<string, PointVisitStatus> {
  const statuses = new Map<string, PointVisitStatus>();
  for (const stop of routes.flatMap((route) => route.stops)) {
    const next = toStopStatus(stop.status);
    if (next === "RELEASED") {
      continue;
    }
    const previous = statuses.get(stop.service_point_id);
    if (previous === undefined || URGENCY[next] < URGENCY[previous]) {
      statuses.set(stop.service_point_id, next);
    }
  }

  return statuses;
}

/** Header numbers of the building panel. @example summarisePoints([...statuses.values()]) */
export function summarisePoints(statuses: PointVisitStatus[]): { total: number; done: number } {
  return {
    total: statuses.length,
    done: statuses.filter((status) => status === "DONE").length,
  };
}
