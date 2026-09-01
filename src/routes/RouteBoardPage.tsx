import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { RouteActionsMenu } from "@/components/RouteActionsMenu";
import { RouteStopStrip } from "@/components/RouteStopStrip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { toLocalIsoDate } from "@/lib/dates";

type ApiClient = ReturnType<typeof createApiClient>;

type RouteType = "REGULAR" | "OCCASIONAL";
type RouteStatus = "PLANNED" | "IN_PROGRESS" | "DONE" | "CANCELLED";

interface RouteFilters {
  date: string;
  fieldWorkerId: string;
  routeType: "" | RouteType;
  status: "" | RouteStatus;
}

const STATUS_LABEL_KEY: Record<RouteStatus, StringKey> = {
  PLANNED: "routeStatusPlanned",
  IN_PROGRESS: "routeStatusInProgress",
  DONE: "routeStatusDone",
  CANCELLED: "routeStatusCancelled",
};

// Pill palette from the board spec: PLANNED neutral, IN_PROGRESS amber, DONE green,
// CANCELLED grey with the worker name struck through (handled on the title, not here).
const STATUS_PILL_CLASS: Record<RouteStatus, string> = {
  PLANNED: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  DONE: "bg-green-100 text-green-800",
  CANCELLED: "bg-muted text-muted-foreground",
};

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
    fieldWorkerId: params.get("field_worker_id") ?? "",
    routeType: (params.get("route_type") as RouteFilters["routeType"] | null) ?? "",
    status: (params.get("status") as RouteFilters["status"] | null) ?? "",
  };
}

function paramsFromFilters(filters: RouteFilters): URLSearchParams {
  const params = new URLSearchParams();
  // Always written (even when empty) so a cleared date stays cleared instead of snapping
  // back to today on the next render.
  params.set("date", filters.date);
  if (filters.fieldWorkerId !== "") {
    params.set("field_worker_id", filters.fieldWorkerId);
  }
  if (filters.routeType !== "") {
    params.set("route_type", filters.routeType);
  }
  if (filters.status !== "") {
    params.set("status", filters.status);
  }

  return params;
}

// `RouteOut.status` is a bare string in the OpenAPI contract; fold any unknown value
// back to PLANNED so the pill never renders undefined.
function toRouteStatus(value: string): RouteStatus {
  return value === "IN_PROGRESS" || value === "DONE" || value === "CANCELLED" ? value : "PLANNED";
}

async function fetchRoutes(client: ApiClient, filters: RouteFilters) {
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
        field_worker_id: filters.fieldWorkerId || undefined,
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

const FILTER_SELECT_CLASS = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm";

export function RouteBoardPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  // Mirrors the other pages' convention: fall back to an empty token instead of asserting a
  // non-null session, so the page renders (and its requests fail cleanly) before hydration.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = filtersFromParams(searchParams);

  function updateFilters(patch: Partial<RouteFilters>) {
    setSearchParams(paramsFromFilters({ ...filters, ...patch }), { replace: true });
  }

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
    queryKey: ["routes", filters],
    queryFn: () => fetchRoutes(client, filters),
    // Stands in for SSE (Stage 9) with a simple poll — enough for the walking skeleton's
    // "the panel shows it", not a claim of true real-time delivery.
    refetchInterval: 10_000,
  });

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("routeBoardTitle")}</h1>
        <div className="flex gap-2">
          <Link
            className="text-sm underline"
            to={{ pathname: "/rotas/nova", search: "?type=REGULAR" }}
          >
            {t("routeBoardNewRoute")}
          </Link>
          <Link
            className="text-sm underline"
            to={{ pathname: "/rotas/nova", search: "?type=OCCASIONAL" }}
          >
            {t("routeBoardNewOccasionalRoute")}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="route-filter-date">{t("routeBoardFilterDate")}</Label>
          <input
            id="route-filter-date"
            type="date"
            className={FILTER_SELECT_CLASS}
            value={filters.date}
            onChange={(event) => {
              updateFilters({ date: event.target.value });
            }}
          />
        </div>
        <div>
          <Label htmlFor="route-filter-worker">{t("routeBoardFilterWorker")}</Label>
          <select
            id="route-filter-worker"
            className={FILTER_SELECT_CLASS}
            value={filters.fieldWorkerId}
            onChange={(event) => {
              updateFilters({ fieldWorkerId: event.target.value });
            }}
          >
            <option value="">{t("routeBoardFilterAll")}</option>
            {workers?.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="route-filter-type">{t("routeBoardFilterType")}</Label>
          <select
            id="route-filter-type"
            className={FILTER_SELECT_CLASS}
            value={filters.routeType}
            onChange={(event) => {
              updateFilters({ routeType: event.target.value as RouteFilters["routeType"] });
            }}
          >
            <option value="">{t("routeBoardFilterAll")}</option>
            <option value="REGULAR">{t("routeTypeRegular")}</option>
            <option value="OCCASIONAL">{t("routeTypeOccasional")}</option>
          </select>
        </div>
        <div>
          <Label htmlFor="route-filter-status">{t("routeBoardFilterStatus")}</Label>
          <select
            id="route-filter-status"
            className={FILTER_SELECT_CLASS}
            value={filters.status}
            onChange={(event) => {
              updateFilters({ status: event.target.value as RouteFilters["status"] });
            }}
          >
            <option value="">{t("routeBoardFilterAll")}</option>
            <option value="PLANNED">{t("routeStatusPlanned")}</option>
            <option value="IN_PROGRESS">{t("routeStatusInProgress")}</option>
            <option value="DONE">{t("routeStatusDone")}</option>
            <option value="CANCELLED">{t("routeStatusCancelled")}</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">{t("routeBoardLoading")}</p>}
      {error && <p className="text-destructive">{t("routeBoardError")}</p>}
      {!isLoading && !error && routes?.length === 0 && (
        <p className="text-muted-foreground">{t("routeBoardEmpty")}</p>
      )}

      {routes?.map((route) => {
        const status = toRouteStatus(route.status);

        return (
          <Card key={route.id} data-testid={`route-card-${route.id}`}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className={`text-base ${status === "CANCELLED" ? "line-through" : ""}`}>
                  {route.field_worker_name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {route.route_type === "OCCASIONAL" && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 uppercase">
                      {t("routeBadgeOccasional")}
                    </span>
                  )}
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLASS[status]}`}
                  >
                    {t(STATUS_LABEL_KEY[status])}
                  </span>
                </div>
              </div>
              <p className="font-mono text-xs text-muted-foreground">{route.route_date}</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <RouteStopStrip
                stops={route.stops.map((stop) => ({
                  id: stop.id,
                  orderIndex: stop.order_index,
                  status: stop.status as "PENDING" | "DONE",
                }))}
              />
              <RouteActionsMenu route={route} />
            </CardContent>
          </Card>
        );
      })}
    </main>
  );
}
