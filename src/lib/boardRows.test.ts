import { describe, expect, it } from "vitest";

import type { components } from "@/api/generated/schema";
import type { BoardSnapshot } from "@/api/monitoringStream";
import {
  buildBoardRows,
  filterRowsByWorkerName,
  groupRowsByCompany,
  paginateGroups,
  urgencyRank,
} from "@/lib/boardRows";

type RouteOut = components["schemas"]["RouteOut"];

function route(id: string, worker: string, name: string, status = "PLANNED"): RouteOut {
  return {
    id,
    field_worker_id: worker,
    field_worker_name: name,
    route_date: "2026-10-11",
    route_type: "REGULAR",
    status,
    scheduled_start_at: null,
    started_at: null,
    routing_degraded: false,
    stops: [
      { id: `${id}-1`, order_index: 1, status: "DONE", service_point_name: "Sala 1" },
      { id: `${id}-2`, order_index: 2, status: "PENDING", service_point_name: "Sala 2" },
    ],
  } as RouteOut;
}

function snapshotWith(delayed: string[], alerts: Record<string, number> = {}): BoardSnapshot {
  return {
    generated_at: "2026-10-11T12:00:00Z",
    routes: [...new Set([...delayed, ...Object.keys(alerts)])].map((id) => ({
      route_id: id,
      field_worker_id: "x",
      field_worker_name: "x",
      route_date: "2026-10-11",
      status: "IN_PROGRESS",
      is_delayed: delayed.includes(id),
      open_alert_count: alerts[id] ?? 0,
      stop_total: 2,
      stop_done: 1,
    })),
    open_alerts: [],
    worker_positions: [
      {
        field_worker_id: "w1",
        field_worker_name: "Ana",
        latitude: -7.2,
        longitude: -35.9,
        reported_at: "2026-10-11T12:00:00Z",
        age_seconds: 60,
      },
    ],
  };
}

const WORKERS = [
  { id: "w1", contractor_company_id: "c1" },
  { id: "w2", contractor_company_id: "c1" },
  { id: "w3", contractor_company_id: "c2" },
  { id: "w4", contractor_company_id: "gone" },
];
const COMPANIES = [
  { id: "c1", name: "Limpa Campus" },
  { id: "c2", name: "Agro Jardins" },
];

describe("buildBoardRows", () => {
  it("joins live flags, company and last position onto each route", () => {
    const [row] = buildBoardRows({
      routes: [route("r1", "w1", "Ana")],
      snapshot: snapshotWith(["r1"], { r1: 2 }),
      workers: WORKERS,
    });

    expect(row).toMatchObject({
      companyId: "c1",
      isDelayed: true,
      openAlertCount: 2,
      stopsDone: 1,
      stopsTotal: 2,
    });
    expect(row?.position?.age_seconds).toBe(60);
  });
});

describe("urgencyRank", () => {
  it("puts delayed, then alerting, then running, then planned, then finished routes", () => {
    const rows = buildBoardRows({
      routes: [
        route("done", "w1", "A", "DONE"),
        route("plan", "w1", "B"),
        route("run", "w1", "C", "IN_PROGRESS"),
        route("alert", "w1", "D", "IN_PROGRESS"),
        route("late", "w1", "E", "IN_PROGRESS"),
      ],
      snapshot: snapshotWith(["late"], { alert: 1 }),
      workers: WORKERS,
    });

    const order = [...rows].sort((a, b) => urgencyRank(a) - urgencyRank(b)).map((r) => r.route.id);
    expect(order).toEqual(["late", "alert", "run", "plan", "done"]);
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

describe("groupRowsByCompany", () => {
  it("groups by company with subtotals, delayed groups first, unknown company last", () => {
    const rows = buildBoardRows({
      routes: [
        route("r1", "w1", "Ana"),
        route("r2", "w2", "Bia", "CANCELLED"),
        route("r3", "w3", "Caio", "IN_PROGRESS"),
        route("r4", "w4", "Davi"),
      ],
      snapshot: snapshotWith(["r3"]),
      workers: WORKERS,
    });

    const groups = groupRowsByCompany(rows, COMPANIES);

    expect(groups.map((group) => group.companyName)).toEqual([
      "Agro Jardins",
      "Limpa Campus",
      null,
    ]);
    expect(groups[0]).toMatchObject({ routeCount: 1, delayedCount: 1 });
    // The cancelled route still counts as a route but not towards stop completion.
    expect(groups[1]).toMatchObject({ routeCount: 2, stopsDone: 1, stopsTotal: 2 });
  });
});

describe("paginateGroups", () => {
  function groupsOf(sizes: number[]) {
    const rows = sizes.flatMap((size, groupIndex) =>
      Array.from({ length: size }, (_, i) =>
        route(
          `g${String(groupIndex)}-${String(i)}`,
          groupIndex === 0 ? "w1" : "w3",
          `P${String(i)}`,
        ),
      ),
    );

    return groupRowsByCompany(
      buildBoardRows({ routes: rows, snapshot: null, workers: WORKERS }),
      COMPANIES,
    );
  }

  it("fills each page with the page size, splitting a company across pages", () => {
    // Agro Jardins (w3) sorts before Limpa Campus (w1): 7 + 8 rows.
    const groups = groupsOf([8, 7]);

    const first = paginateGroups(groups, 1, 10);
    expect(first.groups.map((group) => [group.companyName, group.rows.length])).toEqual([
      ["Agro Jardins", 7],
      ["Limpa Campus", 3],
    ]);
    expect(first).toMatchObject({ pageCount: 2, totalRows: 15, firstRow: 1, lastRow: 10 });

    const second = paginateGroups(groups, 2, 10);
    expect(second.groups.map((group) => [group.companyName, group.rows.length])).toEqual([
      ["Limpa Campus", 5],
    ]);
    // Subtotals still describe the whole company, not just this page.
    expect(second.groups[0]?.routeCount).toBe(8);
    expect(second).toMatchObject({ firstRow: 11, lastRow: 15 });
  });

  it("clamps a page past the end and reports an empty table as one page", () => {
    expect(paginateGroups(groupsOf([3]), 9, 10).page).toBe(1);
    expect(paginateGroups([], 1, 10)).toMatchObject({ pageCount: 1, totalRows: 0, firstRow: 0 });
  });
});
