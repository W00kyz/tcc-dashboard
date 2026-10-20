import { describe, expect, it } from "vitest";

import type { BoardSnapshot } from "@/api/monitoringStream";
import { computeBoardKpis } from "@/lib/boardKpis";

type BoardRoute = BoardSnapshot["routes"][number];
type BoardAlert = BoardSnapshot["open_alerts"][number];

function liveRoute(workerId: string, status: string): BoardRoute {
  return {
    route_id: `${workerId}-${status}`,
    field_worker_id: workerId,
    field_worker_name: "Ana",
    company_name: "Limpa Campus",
    route_date: "2026-10-20",
    status,
    open_alert_count: 0,
    current_batch: 1,
    stops: [],
    done_today: 0,
  };
}

function alert(severity: string): BoardAlert {
  return {
    id: severity,
    kind: "BATCH_RELEASED",
    severity,
    description: "",
    route_id: null,
    route_stop_id: null,
    field_worker_id: null,
    status: "OPEN",
    created_at: "2026-10-20T12:00:00Z",
  };
}

function snapshot(patch: Partial<BoardSnapshot>): BoardSnapshot {
  return {
    generated_at: "2026-10-20T12:00:00Z",
    service_day: true,
    routes: [],
    pool: [],
    not_started: [],
    released_today: 0,
    open_alerts: [],
    worker_positions: [],
    ...patch,
  };
}

describe("computeBoardKpis", () => {
  it("counts each worker with an in-progress route once, paused and done ones left out", () => {
    const kpis = computeBoardKpis(
      snapshot({
        routes: [
          liveRoute("w1", "IN_PROGRESS"),
          liveRoute("w2", "IN_PROGRESS"),
          liveRoute("w2", "IN_PROGRESS"),
          liveRoute("w3", "PAUSED"),
          liveRoute("w4", "DONE"),
        ],
      }),
    );

    expect(kpis.workersOnRoute).toBe(2);
  });

  it("passes the pool and today's releases through from the snapshot", () => {
    const pool = [
      {
        service_type_id: "t1",
        service_type_name: "Limpeza",
        company_name: "Limpa Campus",
        total: 10,
        done: 4,
        in_progress: 2,
        free: 4,
      },
    ];

    expect(computeBoardKpis(snapshot({ pool, released_today: 3 }))).toMatchObject({
      pool,
      releasedToday: 3,
    });
  });

  it("counts open alerts and singles out the critical ones", () => {
    const kpis = computeBoardKpis(snapshot({ open_alerts: [alert("CRITICAL"), alert("WARNING")] }));

    expect(kpis.alertsOpen).toBe(2);
    expect(kpis.alertsCritical).toBe(1);
  });

  it("reads as an empty day before the first snapshot arrives", () => {
    expect(computeBoardKpis(null)).toEqual({
      pool: [],
      workersOnRoute: 0,
      releasedToday: 0,
      alertsOpen: 0,
      alertsCritical: 0,
    });
  });
});
