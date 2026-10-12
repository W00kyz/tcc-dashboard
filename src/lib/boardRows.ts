import type { components } from "@/api/generated/schema";
import type { BoardSnapshot } from "@/api/monitoringStream";
import { toStopStatus } from "@/lib/stopStatus";

type RouteOut = components["schemas"]["RouteOut"];
type BoardRoute = BoardSnapshot["routes"][number];
type BoardPosition = BoardSnapshot["worker_positions"][number];

export interface WorkerCompanyRef {
  id: string;
  contractor_company_id: string;
}

export interface CompanyRef {
  id: string;
  name: string;
}

/** One route as the board table shows it: the route, its live flags and its worker's fix. */
export interface BoardRow {
  route: RouteOut;
  companyId: string | null;
  isDelayed: boolean;
  openAlertCount: number;
  position: BoardPosition | null;
  stopsDone: number;
  stopsTotal: number;
}

export interface BoardRowGroup {
  companyId: string | null;
  companyName: string | null;
  rows: BoardRow[];
  routeCount: number;
  delayedCount: number;
  stopsDone: number;
  stopsTotal: number;
}

// Exceptions first (PRODUCT.md, principle 1): what needs a decision now sorts above what is
// merely running, and finished work sinks to the bottom.
const STATUS_RANK: Record<string, number> = {
  IN_PROGRESS: 2,
  PLANNED: 3,
  DONE: 4,
  CANCELLED: 5,
};

/** Sort rank of a row; lower is more urgent. Example: a delayed route ranks 0. */
export function urgencyRank(row: BoardRow): number {
  if (row.isDelayed) {
    return 0;
  }
  if (row.openAlertCount > 0) {
    return 1;
  }

  return STATUS_RANK[row.route.status] ?? 3;
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

/** Joins each listed route with its live board flags, its worker's company and last fix. */
export function buildBoardRows({ routes, snapshot, workers }: BuildRowsInput): BoardRow[] {
  const boardById = new Map<string, BoardRoute>(
    (snapshot?.routes ?? []).map((route) => [route.route_id, route]),
  );
  const positionByWorker = new Map<string, BoardPosition>(
    (snapshot?.worker_positions ?? []).map((position) => [position.field_worker_id, position]),
  );
  const companyByWorker = new Map(
    workers.map((worker) => [worker.id, worker.contractor_company_id]),
  );

  return routes.map((route) => {
    const live = boardById.get(route.id);
    const stopsDone = route.stops.filter((stop) => toStopStatus(stop.status) === "DONE").length;

    return {
      route,
      companyId: companyByWorker.get(route.field_worker_id) ?? null,
      isDelayed: live?.is_delayed ?? false,
      openAlertCount: live?.open_alert_count ?? 0,
      position: positionByWorker.get(route.field_worker_id) ?? null,
      stopsDone,
      stopsTotal: route.stops.length,
    };
  });
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

function summarise(companyId: string | null, companyName: string | null, rows: BoardRow[]) {
  const active = rows.filter((row) => row.route.status !== "CANCELLED");

  return {
    companyId,
    companyName,
    rows: [...rows].sort(compareRows),
    routeCount: rows.length,
    delayedCount: rows.filter((row) => row.isDelayed).length,
    stopsDone: active.reduce((sum, row) => sum + row.stopsDone, 0),
    stopsTotal: active.reduce((sum, row) => sum + row.stopsTotal, 0),
  };
}

/**
 * Groups rows by contractor company. Inside a group rows are sorted by urgency; groups with a
 * delayed route come first, then by name, and workers with no known company close the list.
 *
 * @example groupRowsByCompany(rows, companies)[0].companyName // "Limpa Campus"
 */
export function groupRowsByCompany(rows: BoardRow[], companies: CompanyRef[]): BoardRowGroup[] {
  const nameById = new Map(companies.map((company) => [company.id, company.name]));
  const buckets = new Map<string | null, BoardRow[]>();
  for (const row of rows) {
    const key = row.companyId !== null && nameById.has(row.companyId) ? row.companyId : null;
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }

  const groups = [...buckets.entries()].map(([companyId, groupRows]) =>
    summarise(companyId, companyId === null ? null : (nameById.get(companyId) ?? null), groupRows),
  );

  return groups.sort((first, second) => {
    if (first.companyName === null || second.companyName === null) {
      return first.companyName === null ? 1 : -1;
    }
    if (first.delayedCount > 0 !== second.delayedCount > 0) {
      return first.delayedCount > 0 ? -1 : 1;
    }

    return first.companyName.localeCompare(second.companyName, "pt-BR");
  });
}

export const BOARD_PAGE_SIZE = 10;

export interface BoardPage {
  groups: BoardRowGroup[];
  page: number;
  pageCount: number;
  totalRows: number;
  firstRow: number;
  lastRow: number;
}

/**
 * One page of the grouped table. Rows are counted across companies in display order, so a
 * page always holds `pageSize` routes; a company split across pages keeps its full-company
 * subtotals on every page it appears in. An out-of-range page is clamped.
 *
 * @example paginateGroups(groups, 2).firstRow // 11
 */
export function paginateGroups(
  groups: BoardRowGroup[],
  page: number,
  pageSize = BOARD_PAGE_SIZE,
): BoardPage {
  const totalRows = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  const end = start + pageSize;

  let offset = 0;
  const pageGroups: BoardRowGroup[] = [];
  for (const group of groups) {
    const groupStart = offset;
    offset += group.rows.length;
    const rows = group.rows.slice(Math.max(0, start - groupStart), Math.max(0, end - groupStart));
    if (rows.length > 0) {
      pageGroups.push({ ...group, rows });
    }
  }

  return {
    groups: pageGroups,
    page: current,
    pageCount,
    totalRows,
    firstRow: totalRows === 0 ? 0 : start + 1,
    lastRow: Math.min(end, totalRows),
  };
}
