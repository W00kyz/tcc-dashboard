import type { BoardSnapshot } from "@/api/monitoringStream";

type PoolKpi = BoardSnapshot["pool"][number];

/** The day's operation in numbers, as the board's KPI strip shows it. */
export interface BoardKpis {
  // Today's typed points per service type: done / total, in somebody's batch, still free.
  pool: PoolKpi[];
  workersOnRoute: number;
  releasedToday: number;
  alertsOpen: number;
  alertsCritical: number;
}

/**
 * Derives the KPI strip from the live board snapshot, where the backend computes the pool and
 * the releases (spec 2026-10-20-alocacao-automatica §8.2). A worker counts as "on route" once,
 * however many open routes the snapshot carries for them (a stale one of an earlier day).
 *
 * @example computeBoardKpis(snapshot).workersOnRoute // 7
 */
export function computeBoardKpis(snapshot: BoardSnapshot | null): BoardKpis {
  const routes = snapshot?.routes ?? [];
  const alerts = snapshot?.open_alerts ?? [];
  const onRoute = routes
    .filter((route) => route.status === "IN_PROGRESS")
    .map((route) => route.field_worker_id);

  return {
    pool: snapshot?.pool ?? [],
    workersOnRoute: new Set(onRoute).size,
    releasedToday: snapshot?.released_today ?? 0,
    alertsOpen: alerts.length,
    alertsCritical: alerts.filter((alert) => alert.severity === "CRITICAL").length,
  };
}
