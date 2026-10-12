import { describe, expect, it } from "vitest";

import type { components } from "@/api/generated/schema";
import type { BoardSnapshot } from "@/api/monitoringStream";
import { computeBoardKpis } from "@/lib/boardKpis";

type RouteOut = components["schemas"]["RouteOut"];
type BoardRoute = BoardSnapshot["routes"][number];
type BoardAlert = BoardSnapshot["open_alerts"][number];

function route(status: string, stopStatuses: string[]): RouteOut {
  return {
    id: `${status}-${String(stopStatuses.length)}`,
    field_worker_id: "w",
    field_worker_name: "Ana",
    route_date: "2026-10-11",
    route_type: "REGULAR",
    status,
    scheduled_start_at: null,
    started_at: null,
    routing_degraded: false,
    stops: stopStatuses.map((stopStatus, index) => ({
      id: String(index),
      order_index: index + 1,
      status: stopStatus,
      service_point_name: "Sala",
    })),
  } as RouteOut;
}

function liveRoute(overrides: Partial<BoardRoute>): BoardRoute {
  return {
    route_id: "r",
    field_worker_id: "w",
    field_worker_name: "Ana",
    route_date: "2026-10-11",
    status: "IN_PROGRESS",
    is_delayed: false,
    open_alert_count: 0,
    stop_total: 4,
    stop_done: 0,
    ...overrides,
  };
}

function alert(severity: string): BoardAlert {
  return {
    id: severity,
    kind: "LATE_STOP",
    severity,
    description: "",
    route_id: "r",
    route_stop_id: null,
    field_worker_id: "w",
    status: "OPEN",
    created_at: "2026-10-11T12:00:00Z",
  };
}

function snapshot(routes: BoardRoute[], alerts: BoardAlert[] = []): BoardSnapshot {
  return {
    generated_at: "2026-10-11T12:00:00Z",
    routes,
    open_alerts: alerts,
    worker_positions: [],
  };
}

describe("computeBoardKpis", () => {
  it("counts the day's routes by state from the route list, finished ones included", () => {
    const kpis = computeBoardKpis({
      dayRoutes: [
        route("IN_PROGRESS", ["DONE", "PENDING"]),
        route("IN_PROGRESS", ["PENDING"]),
        route("DONE", ["DONE", "DONE"]),
        route("CANCELLED", ["PENDING"]),
      ],
      // The live board never carries DONE / CANCELLED routes; they must still be counted.
      snapshot: snapshot([liveRoute({ is_delayed: true }), liveRoute({})]),
    });

    expect(kpis).toMatchObject({
      routeTotal: 4,
      routesInProgress: 2,
      routesDone: 1,
      routesCancelled: 1,
      routesDelayed: 1,
    });
  });

  it("measures stop completion over the day's routes, leaving cancelled ones out", () => {
    const kpis = computeBoardKpis({
      dayRoutes: [
        route("IN_PROGRESS", ["DONE", "DONE", "DONE", "PENDING", "PENDING", "PENDING"]),
        route("DONE", ["DONE", "DONE"]),
        route(
          "CANCELLED",
          Array.from({ length: 10 }, () => "PENDING"),
        ),
      ],
      snapshot: null,
    });

    expect(kpis.stopsDone).toBe(5);
    expect(kpis.stopsTotal).toBe(8);
    expect(kpis.stopCompletionPercent).toBe(63);
  });

  it("reports no completion percentage when nothing is planned", () => {
    const kpis = computeBoardKpis({ dayRoutes: [], snapshot: null });

    expect(kpis.stopCompletionPercent).toBeNull();
    expect(kpis.routeTotal).toBe(0);
  });

  it("counts open alerts from the live board and singles out the critical ones", () => {
    const kpis = computeBoardKpis({
      dayRoutes: [],
      snapshot: snapshot([], [alert("CRITICAL"), alert("WARNING")]),
    });

    expect(kpis.alertsOpen).toBe(2);
    expect(kpis.alertsCritical).toBe(1);
  });
});
