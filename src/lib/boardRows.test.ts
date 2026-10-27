import { describe, expect, it } from "vitest";

import type { components } from "@/api/generated/schema";
import type { BoardSnapshot } from "@/api/monitoringStream";
import { buildBoardRows, filterRowsByWorkerName, paginateRows, urgencyRank } from "@/lib/boardRows";

type RouteOut = components["schemas"]["RouteOut"];

function route(id: string, worker: string, name: string, status = "IN_PROGRESS"): RouteOut {
  return {
    id,
    field_worker_id: worker,
    field_worker_name: name,
    route_date: "2026-10-20",
    status,
    started_at: null,
    routing_degraded: false,
    current_batch: 2,
    stops: [
      { id: `${id}-1`, order_index: 1, batch_number: 1, status: "DONE" },
      { id: `${id}-2`, order_index: 2, batch_number: 1, status: "RELEASED" },
      { id: `${id}-3`, order_index: 3, batch_number: 2, status: "DONE" },
      { id: `${id}-4`, order_index: 4, batch_number: 2, status: "PENDING" },
    ],
  } as RouteOut;
}

function snapshotWith(alerts: Record<string, number> = {}): BoardSnapshot {
  return {
    generated_at: "2026-10-20T12:00:00Z",
    service_day: true,
    routes: Object.entries(alerts).map(([id, count]) => ({
      route_id: id,
      field_worker_id: "x",
      field_worker_name: "x",
      company_name: "x",
      route_date: "2026-10-20",
      status: "IN_PROGRESS",
      open_alert_count: count,
      current_batch: 2,
      stops: [],
      done_today: 2,
    })),
    pool: [],
    not_started: [],
    released_today: 0,
    open_alerts: [],
    worker_positions: [
      {
        field_worker_id: "w1",
        field_worker_name: "Ana",
        latitude: -7.2,
        longitude: -35.9,
        reported_at: "2026-10-20T12:00:00Z",
        age_seconds: 60,
      },
    ],
  };
}

const WORKERS = [
  { id: "w1", contractor_company_id: "c1", contractor_company_name: "Limpa Campus" },
  { id: "w2", contractor_company_id: "c2", contractor_company_name: "Agro Jardins" },
];

describe("buildBoardRows", () => {
  it("joins the alert count, company, last position, current batch and points done", () => {
    const [row] = buildBoardRows({
      routes: [route("r1", "w1", "Ana")],
      snapshot: snapshotWith({ r1: 2 }),
      workers: WORKERS,
    });

    expect(row).toMatchObject({
      companyId: "c1",
      companyName: "Limpa Campus",
      openAlertCount: 2,
      doneToday: 2,
    });
    expect(row?.currentBatch.map((stop) => stop.id)).toEqual(["r1-3", "r1-4"]);
    expect(row?.position?.age_seconds).toBe(60);
  });

  it("leaves the company empty for a worker the list does not know", () => {
    const [row] = buildBoardRows({
      routes: [route("r1", "gone", "Ana")],
      snapshot: null,
      workers: WORKERS,
    });

    expect(row).toMatchObject({ companyId: null, companyName: null, openAlertCount: 0 });
  });
});

describe("urgencyRank", () => {
  it("puts alerting, then paused, then running, then finished routes, then by name", () => {
    const rows = buildBoardRows({
      routes: [
        route("done", "w1", "A", "DONE"),
        route("run-b", "w1", "C"),
        route("run-a", "w1", "B"),
        route("paused", "w1", "D", "PAUSED"),
        route("alert", "w1", "E"),
      ],
      snapshot: snapshotWith({ alert: 1 }),
      workers: WORKERS,
    });

    expect(rows.map((row) => row.route.id)).toEqual(["alert", "paused", "run-a", "run-b", "done"]);
    expect(rows.map(urgencyRank)).toEqual([0, 1, 2, 2, 3]);
  });
});

describe("filterRowsByWorkerName", () => {
  it("matches part of a name ignoring case and accents", () => {
    const rows = buildBoardRows({
      routes: [route("r1", "w1", "Jéssica Lima"), route("r2", "w2", "Carlos Andrade")],
      snapshot: null,
      workers: WORKERS,
    });

    expect(filterRowsByWorkerName(rows, "jess").map((r) => r.route.id)).toEqual(["r1"]);
    expect(filterRowsByWorkerName(rows, "  ")).toHaveLength(2);
  });
});

describe("paginateRows", () => {
  function rowsOf(count: number) {
    return buildBoardRows({
      routes: Array.from({ length: count }, (_, i) =>
        route(`r${String(i)}`, "w1", `P${String(i).padStart(2, "0")}`),
      ),
      snapshot: null,
      workers: WORKERS,
    });
  }

  it("fills each page with the page size", () => {
    const rows = rowsOf(15);

    const first = paginateRows(rows, 1, 10);
    expect(first.rows).toHaveLength(10);
    expect(first).toMatchObject({ pageCount: 2, totalRows: 15, firstRow: 1, lastRow: 10 });

    const second = paginateRows(rows, 2, 10);
    expect(second.rows.map((row) => row.route.field_worker_name)).toEqual([
      "P10",
      "P11",
      "P12",
      "P13",
      "P14",
    ]);
    expect(second).toMatchObject({ firstRow: 11, lastRow: 15 });
  });

  it("clamps a page past the end and reports an empty table as one page", () => {
    expect(paginateRows(rowsOf(3), 9, 10).page).toBe(1);
    expect(paginateRows([], 1, 10)).toMatchObject({ pageCount: 1, totalRows: 0, firstRow: 0 });
  });
});
