import type { BadgeTone } from "@/components/ui/badge";
import type { StringKey } from "@/i18n/strings";

// Spec 2026-10-20-alocacao-automatica §5.3: a route is born IN_PROGRESS on the worker's first
// "Iniciar rota", PAUSED once its points went back to the pool, DONE at the end of the day.
export type RouteStatus = "IN_PROGRESS" | "PAUSED" | "DONE";

export const ROUTE_STATUSES: RouteStatus[] = ["IN_PROGRESS", "PAUSED", "DONE"];

export const ROUTE_STATUS_LABEL_KEY: Record<RouteStatus, StringKey> = {
  IN_PROGRESS: "routeStatusInProgress",
  PAUSED: "routeStatusPaused",
  DONE: "routeStatusDone",
};

// IN_PROGRESS amber, DONE green; PAUSED red because its points were released — the exception
// the manager should look at.
export const ROUTE_STATUS_TONE: Record<RouteStatus, BadgeTone> = {
  IN_PROGRESS: "progress",
  PAUSED: "late",
  DONE: "done",
};

/** `RouteOut.status` is a bare string in the OpenAPI contract; fold any unknown value back to
 * IN_PROGRESS so the badge never renders undefined. Example: `toRouteStatus("PAUSED")`. */
export function toRouteStatus(value: string): RouteStatus {
  return value === "PAUSED" || value === "DONE" ? value : "IN_PROGRESS";
}
