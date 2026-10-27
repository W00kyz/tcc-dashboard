import type { components } from "@/api/generated/schema";
import type { BoardSnapshot } from "@/api/monitoringStream";
import { toStopStatus } from "@/lib/stopStatus";

type RouteOut = components["schemas"]["RouteOut"];
type RouteStopOut = RouteOut["stops"][number];
type BoardRoute = BoardSnapshot["routes"][number];
type BoardPosition = BoardSnapshot["worker_positions"][number];

export interface WorkerCompanyRef {
  id: string;
  contractor_company_id: string;
  contractor_company_name: string;
}

/** One route as the board table shows it: who, for which company, the batch they are on. */
export interface BoardRow {
  route: RouteOut;
  companyId: string | null;
  companyName: string | null;
  openAlertCount: number;
  position: BoardPosition | null;
  // The stops of `route.current_batch`, released ones included (they show greyed out).
  currentBatch: RouteStopOut[];
  doneToday: number;
}

// Exceptions first (PRODUCT.md, principle 1): a route with open alerts, then one whose points
// were released (PAUSED), above what is merely running; finished work sinks to the bottom.
const STATUS_RANK: Record<string, number> = {
  PAUSED: 1,
  IN_PROGRESS: 2,
  DONE: 3,
};

/** Sort rank of a row; lower is more urgent. Example: a route with an open alert ranks 0. */
export function urgencyRank(row: BoardRow): number {
  if (row.openAlertCount > 0) {
    return 0;
  }

  return STATUS_RANK[row.route.status] ?? 2;
}

function compareRows(first: BoardRow, second: BoardRow): number {
  const byUrgency = urgencyRank(first) - urgencyRank(second);
  if (byUrgency !== 0) {
    return byUrgency;
  }

  return first.route.field_worker_name.localeCompare(second.route.field_worker_name, "pt-BR");
}

interface BuildRowsInput {
  routes: RouteOut[];
  snapshot: BoardSnapshot | null;
  workers: WorkerCompanyRef[];
}

/** Joins each listed route with its live alert count, its worker's company and last fix, sorted
 * by urgency then name. */
export function buildBoardRows({ routes, snapshot, workers }: BuildRowsInput): BoardRow[] {
  const boardById = new Map<string, BoardRoute>(
    (snapshot?.routes ?? []).map((route) => [route.route_id, route]),
  );
  const positionByWorker = new Map<string, BoardPosition>(
    (snapshot?.worker_positions ?? []).map((position) => [position.field_worker_id, position]),
  );
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));

  const rows = routes.map((route) => {
    const worker = workerById.get(route.field_worker_id);

    return {
      route,
      companyId: worker?.contractor_company_id ?? null,
      companyName: worker?.contractor_company_name ?? null,
      openAlertCount: boardById.get(route.id)?.open_alert_count ?? 0,
      position: positionByWorker.get(route.field_worker_id) ?? null,
      currentBatch: route.stops.filter((stop) => stop.batch_number === route.current_batch),
      doneToday: route.stops.filter((stop) => toStopStatus(stop.status) === "DONE").length,
    };
  });

  return rows.sort(compareRows);
}

/** Keeps the rows whose worker name contains `query` (case- and accent-insensitive). */
export function filterRowsByWorkerName(rows: BoardRow[], query: string): BoardRow[] {
  const normalise = (text: string) =>
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("pt-BR")
      .trim();
  const needle = normalise(query);
  if (needle === "") {
    return rows;
  }

  return rows.filter((row) => normalise(row.route.field_worker_name).includes(needle));
}

export const BOARD_PAGE_SIZE = 10;

export interface BoardPage {
  rows: BoardRow[];
  page: number;
  pageCount: number;
  totalRows: number;
  firstRow: number;
  lastRow: number;
}

/**
 * One page of the table. An out-of-range page is clamped.
 *
 * @example paginateRows(rows, 2).firstRow // 11
 */
export function paginateRows(
  rows: BoardRow[],
  page: number,
  pageSize = BOARD_PAGE_SIZE,
): BoardPage {
  const totalRows = rows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  const end = start + pageSize;

  return {
    rows: rows.slice(start, end),
    page: current,
    pageCount,
    totalRows,
    firstRow: totalRows === 0 ? 0 : start + 1,
    lastRow: Math.min(end, totalRows),
  };
}
