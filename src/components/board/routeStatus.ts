import type { BadgeTone } from "@/components/ui/badge";
import type { StringKey } from "@/i18n/strings";

export type RouteStatus = "PLANNED" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export const ROUTE_STATUS_LABEL_KEY: Record<RouteStatus, StringKey> = {
  PLANNED: "routeStatusPlanned",
  IN_PROGRESS: "routeStatusInProgress",
  DONE: "routeStatusDone",
  CANCELLED: "routeStatusCancelled",
};

// Board spec palette: PLANNED neutral, IN_PROGRESS amber, DONE green, CANCELLED grey with the
// worker name struck through (handled on the title, not here).
export const ROUTE_STATUS_TONE: Record<RouteStatus, BadgeTone> = {
  PLANNED: "pending",
  IN_PROGRESS: "progress",
  DONE: "done",
  CANCELLED: "pending",
};

/** `RouteOut.status` is a bare string in the OpenAPI contract; fold any unknown value back to
 * PLANNED so the badge never renders undefined. Example: `toRouteStatus("DONE")`. */
export function toRouteStatus(value: string): RouteStatus {
  return value === "IN_PROGRESS" || value === "DONE" || value === "CANCELLED" ? value : "PLANNED";
}
