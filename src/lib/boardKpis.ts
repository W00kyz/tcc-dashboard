import type { components } from "@/api/generated/schema";
import type { BoardSnapshot } from "@/api/monitoringStream";
import { toStopStatus } from "@/lib/stopStatus";

type RouteOut = components["schemas"]["RouteOut"];

/** The day's operation in numbers, as the board's KPI strip shows it. */
export interface BoardKpis {
  routeTotal: number;
  routesCancelled: number;
  routesInProgress: number;
  routesDone: number;
  routesDelayed: number;
  stopsDone: number;
  stopsTotal: number;
  // 0–100, rounded; null when no stop is planned (nothing to be a percentage of).
  stopCompletionPercent: number | null;
  alertsOpen: number;
  alertsCritical: number;
}

interface BoardKpiInput {
  // Every route of the day from GET /routes?date=<today>, with no other filter.
  dayRoutes: RouteOut[];
  snapshot: BoardSnapshot | null;
}

function countByStatus(routes: RouteOut[], status: string): number {
  return routes.filter((route) => route.status === status).length;
}

/**
 * Derives the KPI strip. Route and stop counts come from the day's route list: the live board
 * snapshot only carries PLANNED / IN_PROGRESS routes (tcc-backend `build_board`), so it can
 * never count what was finished or cancelled. Delays and alerts come from the snapshot, which
 * is where the backend computes them. Cancelled routes count as routes of the day but their
 * stops are left out of completion: nobody is going to visit them.
 *
 * @example computeBoardKpis({ dayRoutes, snapshot }).stopCompletionPercent // 64
 */
export function computeBoardKpis({ dayRoutes, snapshot }: BoardKpiInput): BoardKpis {
  const activeRoutes = dayRoutes.filter((route) => route.status !== "CANCELLED");
  const stops = activeRoutes.flatMap((route) => route.stops);
  const stopsDone = stops.filter((stop) => toStopStatus(stop.status) === "DONE").length;
  const alerts = snapshot?.open_alerts ?? [];

  return {
    routeTotal: dayRoutes.length,
    routesCancelled: dayRoutes.length - activeRoutes.length,
    routesInProgress: countByStatus(dayRoutes, "IN_PROGRESS"),
    routesDone: countByStatus(dayRoutes, "DONE"),
    routesDelayed: (snapshot?.routes ?? []).filter((route) => route.is_delayed).length,
    stopsDone,
    stopsTotal: stops.length,
    stopCompletionPercent: stops.length === 0 ? null : Math.round((stopsDone / stops.length) * 100),
    alertsOpen: alerts.length,
    alertsCritical: alerts.filter((alert) => alert.severity === "CRITICAL").length,
  };
}
