import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { BoardSnapshot } from "@/api/monitoringStream";
import { useBoardStream } from "@/api/monitoringStream";
import { useAuth } from "@/auth/AuthContext";
import { BoardKpiStrip } from "@/components/board/BoardKpiStrip";
import { BoardPager } from "@/components/board/BoardPager";
import { BuildingPanel } from "@/components/board/BuildingPanel";
import { OpenAlertsPanel } from "@/components/board/OpenAlertsPanel";
import { OperationsMapPanel } from "@/components/board/OperationsMapPanel";
import { RouteBoardFilters, type RouteFilters } from "@/components/board/RouteBoardFilters";
import { RouteBoardTable } from "@/components/board/RouteBoardTable";
import { useBoardBuildings } from "@/components/board/useBoardBuildings";
import { Page, PageHeader } from "@/components/layout/Page";
import { EmptyState, ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { useReviewQueueCount } from "@/hooks/useReviewQueueCount";
import { useTranslation } from "@/i18n/useTranslation";
import { computeBoardKpis } from "@/lib/boardKpis";
import {
  buildBoardRows,
  filterRowsByWorkerName,
  groupRowsByCompany,
  paginateGroups,
} from "@/lib/boardRows";
import { formatIsoDateLongBr, toLocalIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type ApiClient = ReturnType<typeof createApiClient>;

// The board's filters live in the URL, not in component state: a route just created elsewhere
// navigates here with `?route_type=OCCASIONAL` (Task 11) or `?date=<materialized>` (Task 12),
// and the board must land already filtered. Deriving the filters from the query string also
// makes the board deep-linkable and refreshable. An absent `date` param means "today"; an
// explicit empty `date=` means "every date" (the user cleared the native date input).
function filtersFromParams(params: URLSearchParams): RouteFilters {
  // `?? toLocalIsoDate()` only fills a *missing* param; an explicit empty `date=` (user cleared
  // the input) is kept as "" so the fetch omits the date and the backend returns every date.
  return {
    date: params.get("date") ?? toLocalIsoDate(),
    workerQuery: params.get("q") ?? "",
    companyId: params.get("company") ?? "",
    routeType: (params.get("route_type") as RouteFilters["routeType"] | null) ?? "",
    status: (params.get("status") as RouteFilters["status"] | null) ?? "",
  };
}

function paramsFromFilters(filters: RouteFilters): URLSearchParams {
  const params = new URLSearchParams();
  // Always written (even when empty) so a cleared date stays cleared instead of snapping
  // back to today on the next render.
  params.set("date", filters.date);
  if (filters.workerQuery !== "") {
    params.set("q", filters.workerQuery);
  }
  if (filters.companyId !== "") {
    params.set("company", filters.companyId);
  }
  if (filters.routeType !== "") {
    params.set("route_type", filters.routeType);
  }
  if (filters.status !== "") {
    params.set("status", filters.status);
  }

  return params;
}

type BoardAlert = BoardSnapshot["open_alerts"][number];

// The subset of filters the API applies; search and company are applied in the browser, so
// they stay out of the query key and typing a name never refetches.
type ApiRouteFilters = Pick<RouteFilters, "date" | "routeType" | "status">;

async function fetchRoutes(client: ApiClient, filters: ApiRouteFilters) {
  // The OpenAPI spec for GET /routes only declares the 200 response, so openapi-fetch
  // types `error` as always-undefined here; check `response.ok` instead to still catch
  // an undeclared 401/500 at runtime.
  const { data, response } = await client.GET("/routes", {
    params: {
      query: {
        // Clearing the native date input (its ✕ affordance) sets the value to ""; send
        // `undefined` so openapi-fetch omits the param — the backend treats a missing
        // `date` as "every date" and would 422 on an empty string.
        date: filters.date || undefined,
        route_type: filters.routeType || undefined,
        status: filters.status || undefined,
      },
    },
  });
  if (!response.ok) {
    throw new Error("failed-to-load-routes");
  }

  return data ?? [];
}

export function RouteBoardPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors the other pages' convention: fall back to an empty token instead of asserting a
  // non-null session, so the page renders (and its requests fail cleanly) before hydration.
  const token = session?.accessToken ?? "";
  const client = createApiClient(apiBaseUrl, token);

  // Ruling 4: the board is a live SSE feed. `useBoardStream` carries the delay flags and the
  // open-alert list; after 3 consecutive stream failures it flips `fallback` and the board
  // query below takes over polling `GET /monitoring/board`.
  const { snapshot: streamSnapshot, fallback } = useBoardStream(
    token,
    `${apiBaseUrl}/monitoring/stream`,
  );
  const hasSnapshot = streamSnapshot !== null;

  const boardFallbackQuery = useQuery({
    queryKey: ["monitoring-board"],
    queryFn: async (): Promise<BoardSnapshot> => {
      const { data, response } = await client.GET("/monitoring/board");
      if (!response.ok || data === undefined) {
        throw new Error(`GET /monitoring/board failed with status ${String(response.status)}.`);
      }

      return data;
    },
    // Only hit the endpoint when the stream can't serve the snapshot: once at first paint
    // before the first frame lands, then on a 10s poll if the stream has given up.
    enabled: fallback || !hasSnapshot,
    refetchInterval: fallback ? 10_000 : false,
  });

  // In fallback mode the stream is dead but `streamSnapshot` still holds its last (now stale)
  // frame; prefer the polled query so acknowledge/resolve and route changes keep showing up.
  const snapshot: BoardSnapshot | null = fallback
    ? (boardFallbackQuery.data ?? streamSnapshot ?? null)
    : (streamSnapshot ?? boardFallbackQuery.data ?? null);
  const openAlerts: BoardAlert[] = snapshot?.open_alerts ?? [];
  const workerPositions = snapshot?.worker_positions ?? [];
  const delayedWorkerIds = useMemo(
    () =>
      new Set(
        (snapshot?.routes ?? [])
          .filter((route) => route.is_delayed)
          .map((route) => route.field_worker_id),
      ),
    [snapshot],
  );
  // The map's view is fixed on the campus: "locating" a worker highlights their marker (bigger,
  // haloed, labelled) instead of moving the map, and a marker click highlights the row.
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  function locateWorker(workerId: string) {
    setSelectedWorkerId(workerId);
  }
  const reviewQueue = useReviewQueueCount(true);

  // The stream is now the realtime channel the old `refetchInterval` stood in for: when the
  // snapshot changes a route's membership OR its in-place state (a PLANNED→IN_PROGRESS
  // transition, a stop completing), refresh the filtered list so the card's status pill and
  // stop strip don't go stale.
  const snapshotRouteKey = (snapshot?.routes ?? [])
    .map((route) => `${route.route_id}:${route.status}:${String(route.stop_done)}`)
    .sort((a, b) => a.localeCompare(b))
    .join(",");
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["routes"] });
  }, [snapshotRouteKey, queryClient]);

  const acknowledgeAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const { response } = await client.POST("/alerts/{alert_id}/acknowledge", {
        params: { path: { alert_id: alertId } },
      });
      if (!response.ok) {
        throw new Error(`POST /alerts/${alertId}/acknowledge failed (${String(response.status)}).`);
      }
    },
    // The stream pushes a fresh snapshot after the mutation; the invalidate only matters in
    // fallback mode, where the board query is the source.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoring-board"] });
    },
  });

  const resolveAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const { response } = await client.POST("/alerts/{alert_id}/resolve", {
        params: { path: { alert_id: alertId } },
      });
      if (!response.ok) {
        throw new Error(`POST /alerts/${alertId}/resolve failed (${String(response.status)}).`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["monitoring-board"] });
    },
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = filtersFromParams(searchParams);

  function updateFilters(patch: Partial<RouteFilters>) {
    setSearchParams(paramsFromFilters({ ...filters, ...patch }), { replace: true });
  }

  const apiFilters: ApiRouteFilters = {
    date: filters.date,
    routeType: filters.routeType,
    status: filters.status,
  };

  const { data: companies } = useQuery({
    queryKey: ["contractor-companies"],
    queryFn: async () => {
      const { data } = await client.GET("/contractor-companies");

      return data ?? [];
    },
  });

  const { data: workers } = useQuery({
    queryKey: ["field-workers"],
    queryFn: async () => {
      const { data } = await client.GET("/field-workers");

      return data ?? [];
    },
  });

  const {
    data: routes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["routes", apiFilters],
    queryFn: () => fetchRoutes(client, apiFilters),
    // No `refetchInterval` any more — the board stream (Ruling 4) drives realtime updates and
    // invalidates this query when the snapshot's route set changes.
  });

  const groups = useMemo(() => {
    const rows = buildBoardRows({ routes: routes ?? [], snapshot, workers: workers ?? [] });
    const byCompany =
      filters.companyId === "" ? rows : rows.filter((row) => row.companyId === filters.companyId);

    return groupRowsByCompany(
      filterRowsByWorkerName(byCompany, filters.workerQuery),
      companies ?? [],
    );
  }, [routes, snapshot, workers, companies, filters.companyId, filters.workerQuery]);

  // The KPIs describe the whole day whatever the table filters say. With the default filters
  // this is the same query key as the table's, so React Query serves both from one request;
  // the stream's ["routes"] invalidation refreshes it too.
  const today = toLocalIsoDate();
  const dayFilters: ApiRouteFilters = { date: today, routeType: "", status: "" };
  const { data: dayRoutes } = useQuery({
    queryKey: ["routes", dayFilters],
    queryFn: () => fetchRoutes(client, dayFilters),
  });
  const kpis = useMemo(
    () => computeBoardKpis({ dayRoutes: dayRoutes ?? [], snapshot }),
    [dayRoutes, snapshot],
  );

  // Buildings are drawn on the map; opening one swaps the alert rail for its floors and points.
  const delayedRouteIds = useMemo(
    () => new Set((snapshot?.routes ?? []).filter((r) => r.is_delayed).map((r) => r.route_id)),
    [snapshot],
  );
  const board = useBoardBuildings({ dayRoutes: dayRoutes ?? [], delayedRouteIds });

  // Any filter change (all of them live in the query string) starts again at page 1.
  const filterKey = searchParams.toString();
  const [pageState, setPageState] = useState({ filterKey, page: 1 });
  const requestedPage = pageState.filterKey === filterKey ? pageState.page : 1;
  const tablePage = paginateGroups(groups, requestedPage);
  const routesSectionRef = useRef<HTMLElement>(null);
  function goToPage(page: number) {
    setPageState({ filterKey, page });
    // Keep the manager's eyes on the table's first row, not wherever the pager was.
    routesSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <Page width="wide">
      <PageHeader
        title={t("routeBoardTitle")}
        description={<BoardLiveStatus fallback={fallback} date={filters.date} />}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={{ pathname: "/rotas/nova", search: "?type=OCCASIONAL" }}>
                {t("routeBoardNewOccasionalRoute")}
              </Link>
            </Button>
            <Button asChild>
              <Link to={{ pathname: "/rotas/nova", search: "?type=REGULAR" }}>
                {t("routeBoardNewRoute")}
              </Link>
            </Button>
          </>
        }
      />

      <BoardKpiStrip
        kpis={kpis}
        reviewQueue={reviewQueue}
        onShowInProgress={() => {
          updateFilters({ status: "IN_PROGRESS" });
        }}
      />

      <RouteBoardFilters filters={filters} companies={companies ?? []} onChange={updateFilters} />

      {/* The map is the board's centrepiece, with the alert rail beside it on wide screens and
       * right under it on a phone. The exact positions live in the table's position column. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <OperationsMapPanel
          positions={workerPositions}
          delayedWorkerIds={delayedWorkerIds}
          selectedWorkerId={selectedWorkerId}
          onSelectWorker={setSelectedWorkerId}
          buildings={board.mapBuildings}
          selectedBuildingId={board.selectedBuildingId}
          onSelectBuilding={board.selectBuilding}
          servicePoints={board.mapPoints}
          selectedPointId={board.selectedPointId}
          onSelectPoint={board.selectPoint}
        />
        <aside className="space-y-6">
          {board.panelProps !== null && <BuildingPanel {...board.panelProps} />}
          {board.panelProps === null && (
            <OpenAlertsPanel
              alerts={openAlerts}
              onAcknowledge={(alertId) => {
                acknowledgeAlert.mutate(alertId);
              }}
              onResolve={(alertId) => {
                resolveAlert.mutate(alertId);
              }}
              acknowledgePending={acknowledgeAlert.isPending}
              resolvePending={resolveAlert.isPending}
              actionFailed={acknowledgeAlert.isError || resolveAlert.isError}
            />
          )}
        </aside>
      </div>

      <section
        ref={routesSectionRef}
        aria-labelledby="board-routes-heading"
        className="scroll-mt-20 space-y-3"
      >
        <h2 id="board-routes-heading" className="text-primary text-base font-bold">
          {t("routeBoardRoutesLabel")}
        </h2>
        {isLoading && <LoadingMessage>{t("routeBoardLoading")}</LoadingMessage>}
        {error && <ErrorMessage>{t("routeBoardError")}</ErrorMessage>}
        {!isLoading && !error && routes?.length === 0 && (
          <EmptyState>{t("routeBoardEmpty")}</EmptyState>
        )}
        {routes !== undefined && routes.length > 0 && groups.length === 0 && (
          <EmptyState>{t("routeBoardNoMatch")}</EmptyState>
        )}
        {groups.length > 0 && (
          <>
            <RouteBoardTable
              groups={tablePage.groups}
              selectedWorkerId={selectedWorkerId}
              onSelectWorker={locateWorker}
            />
            <BoardPager page={tablePage} onPageChange={goToPage} />
          </>
        )}
      </section>
    </Page>
  );
}

function BoardLiveStatus({ fallback, date }: { fallback: boolean; date: string }) {
  const { t } = useTranslation();
  const longDate = formatIsoDateLongBr(date);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {longDate && (
        <span className="text-foreground font-semibold first-letter:uppercase">{longDate}</span>
      )}
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          fallback ? "bg-status-progress" : "bg-status-done animate-pulse",
        )}
      />
      {fallback ? t("boardLivePolling") : t("boardLiveStream")}
    </span>
  );
}
