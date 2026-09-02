import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { ExecutionDetailDrawer } from "@/components/ExecutionDetailDrawer";
import { Label } from "@/components/ui/label";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { toLocalIsoDate } from "@/lib/dates";

type ApiClient = ReturnType<typeof createApiClient>;

type ReviewStatus = "PENDING_REVIEW" | "RESOLVED" | "NONE";
type GeoValidation = "VALIDATED" | "OUT_OF_RADIUS" | "NOT_VALIDATED";
type ExecutionSource = "APP" | "MANAGER_MANUAL";

interface ExecutionFilters {
  dateFrom: string;
  dateTo: string;
  fieldWorkerId: string;
  servicePointId: string;
  buildingId: string;
  reviewStatus: "" | ReviewStatus;
  geoValidation: "" | GeoValidation;
  source: "" | ExecutionSource;
}

const PAGE_SIZE = 50;
const DEFAULT_WINDOW_DAYS = 7;

// Same green/amber/grey vocabulary as RouteBoardPage's STATUS_PILL: a validated scan reads
// as "good", out-of-radius as "needs a look", not-validated as neutral/missing.
const GEO_BADGE: Record<GeoValidation, { key: StringKey; className: string }> = {
  VALIDATED: { key: "executionsGeoValidated", className: "bg-green-100 text-green-800" },
  OUT_OF_RADIUS: { key: "executionsGeoOutOfRadius", className: "bg-amber-100 text-amber-800" },
  NOT_VALIDATED: { key: "executionsGeoNotValidated", className: "bg-muted text-muted-foreground" },
};

// NONE is deliberately absent: an execution with nothing to review shows no pill at all.
const REVIEW_BADGE: Record<"PENDING_REVIEW" | "RESOLVED", { key: StringKey; className: string }> = {
  PENDING_REVIEW: { key: "executionsReviewPending", className: "bg-amber-100 text-amber-800" },
  RESOLVED: { key: "executionsReviewResolved", className: "bg-green-100 text-green-800" },
};

const SOURCE_LABEL_KEY: Record<ExecutionSource, StringKey> = {
  APP: "executionsSourceApp",
  MANAGER_MANUAL: "executionsSourceManual",
};

// `ExecutionListItem` types these enum-ish fields as bare `string`; fold any value outside
// the known set back to null so a stray backend value never indexes a badge map as undefined.
function toGeoValidation(value: string | null): GeoValidation | null {
  return value === "VALIDATED" || value === "OUT_OF_RADIUS" || value === "NOT_VALIDATED"
    ? value
    : null;
}

function toReviewBadge(value: string): "PENDING_REVIEW" | "RESOLVED" | null {
  return value === "PENDING_REVIEW" || value === "RESOLVED" ? value : null;
}

function toSource(value: string): ExecutionSource {
  return value === "MANAGER_MANUAL" ? "MANAGER_MANUAL" : "APP";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Filters live in the URL, not component state (mirrors RouteBoardPage): the review-queue
// badge deep-links here with `?review_status=PENDING_REVIEW`, and `service_point_id` is a
// URL-only filter with no picker in the bar. A missing `date_from` defaults to a 7-day
// window; an explicit empty `date_from=` is kept so a cleared input means "every date".
function filtersFromParams(params: URLSearchParams): ExecutionFilters {
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - DEFAULT_WINDOW_DAYS);

  return {
    dateFrom: params.get("date_from") ?? toLocalIsoDate(defaultFrom),
    dateTo: params.get("date_to") ?? "",
    fieldWorkerId: params.get("field_worker_id") ?? "",
    servicePointId: params.get("service_point_id") ?? "",
    buildingId: params.get("building_id") ?? "",
    reviewStatus: (params.get("review_status") as ExecutionFilters["reviewStatus"] | null) ?? "",
    geoValidation: (params.get("geo_validation") as ExecutionFilters["geoValidation"] | null) ?? "",
    source: (params.get("source") as ExecutionFilters["source"] | null) ?? "",
  };
}

function paramsFromFilters(filters: ExecutionFilters): URLSearchParams {
  const params = new URLSearchParams();

  // Always written (even when empty) so a cleared start date stays cleared instead of
  // snapping back to the 7-day default on the next render.
  params.set("date_from", filters.dateFrom);
  const optional: [string, string][] = [
    ["date_to", filters.dateTo],
    ["field_worker_id", filters.fieldWorkerId],
    ["service_point_id", filters.servicePointId],
    ["building_id", filters.buildingId],
    ["review_status", filters.reviewStatus],
    ["geo_validation", filters.geoValidation],
    ["source", filters.source],
  ];
  for (const [key, value] of optional) {
    if (value !== "") {
      params.set(key, value);
    }
  }

  return params;
}

async function fetchExecutions(client: ApiClient, filters: ExecutionFilters, page: number) {
  const { data, response } = await client.GET("/executions", {
    params: {
      query: {
        // Empty string would 422 on the backend; send `undefined` so openapi-fetch omits it.
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        field_worker_id: filters.fieldWorkerId || undefined,
        service_point_id: filters.servicePointId || undefined,
        building_id: filters.buildingId || undefined,
        review_status: filters.reviewStatus || undefined,
        geo_validation: filters.geoValidation || undefined,
        source: filters.source || undefined,
        page,
        page_size: PAGE_SIZE,
      },
    },
  });

  if (!response.ok) {
    throw new Error("failed-to-load-executions");
  }

  return data ?? { items: [], total: 0, page, page_size: PAGE_SIZE };
}

const FILTER_CONTROL_CLASS =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm";
const BADGE_CLASS = "inline-block rounded px-2 py-0.5 text-xs font-medium";

export function ExecutionHistoryPage() {
  const { t } = useTranslation();
  const { session } = useAuth();

  // Mirrors the other pages' convention: fall back to an empty token instead of asserting a
  // non-null session, so the page renders (and its requests fail cleanly) before hydration.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = filtersFromParams(searchParams);
  const [page, setPage] = useState(1);

  function updateFilters(patch: Partial<ExecutionFilters>) {
    // A changed filter can shrink the result set below the current page — always go back
    // to page 1 so the table never lands on an empty trailing page.
    setPage(1);
    setSearchParams(paramsFromFilters({ ...filters, ...patch }), { replace: true });
  }

  const { data: workers } = useQuery({
    queryKey: ["field-workers"],
    queryFn: async () => {
      const { data } = await client.GET("/field-workers");

      return data ?? [];
    },
  });

  const { data: buildings } = useQuery({
    queryKey: ["buildings"],
    queryFn: async () => {
      const { data } = await client.GET("/buildings");

      return data ?? [];
    },
  });

  const {
    data: executions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["executions", filters, page],
    queryFn: () => fetchExecutions(client, filters, page),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const total = executions?.total ?? 0;
  const items = executions?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("executionHistoryTitle")}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <Label htmlFor="execution-filter-date-from">{t("executionsFilterDateFrom")}</Label>
          <input
            id="execution-filter-date-from"
            type="date"
            className={FILTER_CONTROL_CLASS}
            value={filters.dateFrom}
            onChange={(event) => {
              updateFilters({ dateFrom: event.target.value });
            }}
          />
        </div>
        <div>
          <Label htmlFor="execution-filter-date-to">{t("executionsFilterDateTo")}</Label>
          <input
            id="execution-filter-date-to"
            type="date"
            className={FILTER_CONTROL_CLASS}
            value={filters.dateTo}
            onChange={(event) => {
              updateFilters({ dateTo: event.target.value });
            }}
          />
        </div>
        <div>
          <Label htmlFor="execution-filter-worker">{t("executionsFilterWorker")}</Label>
          <select
            id="execution-filter-worker"
            className={FILTER_CONTROL_CLASS}
            value={filters.fieldWorkerId}
            onChange={(event) => {
              updateFilters({ fieldWorkerId: event.target.value });
            }}
          >
            <option value="">{t("executionsFilterAll")}</option>
            {workers?.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="execution-filter-building">{t("executionsFilterBuilding")}</Label>
          <select
            id="execution-filter-building"
            className={FILTER_CONTROL_CLASS}
            value={filters.buildingId}
            onChange={(event) => {
              updateFilters({ buildingId: event.target.value });
            }}
          >
            <option value="">{t("executionsFilterAll")}</option>
            {buildings?.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="execution-filter-review">{t("executionsFilterReviewStatus")}</Label>
          <select
            id="execution-filter-review"
            className={FILTER_CONTROL_CLASS}
            value={filters.reviewStatus}
            onChange={(event) => {
              updateFilters({
                reviewStatus: event.target.value as ExecutionFilters["reviewStatus"],
              });
            }}
          >
            <option value="">{t("executionsFilterAll")}</option>
            <option value="PENDING_REVIEW">{t("executionsReviewPending")}</option>
            <option value="RESOLVED">{t("executionsReviewResolved")}</option>
            <option value="NONE">{t("executionsReviewNone")}</option>
          </select>
        </div>
        <div>
          <Label htmlFor="execution-filter-geo">{t("executionsFilterGeoValidation")}</Label>
          <select
            id="execution-filter-geo"
            className={FILTER_CONTROL_CLASS}
            value={filters.geoValidation}
            onChange={(event) => {
              updateFilters({
                geoValidation: event.target.value as ExecutionFilters["geoValidation"],
              });
            }}
          >
            <option value="">{t("executionsFilterAll")}</option>
            <option value="VALIDATED">{t("executionsGeoValidated")}</option>
            <option value="OUT_OF_RADIUS">{t("executionsGeoOutOfRadius")}</option>
            <option value="NOT_VALIDATED">{t("executionsGeoNotValidated")}</option>
          </select>
        </div>
        <div>
          <Label htmlFor="execution-filter-source">{t("executionsFilterSource")}</Label>
          <select
            id="execution-filter-source"
            className={FILTER_CONTROL_CLASS}
            value={filters.source}
            onChange={(event) => {
              updateFilters({ source: event.target.value as ExecutionFilters["source"] });
            }}
          >
            <option value="">{t("executionsFilterAll")}</option>
            <option value="APP">{t("executionsSourceApp")}</option>
            <option value="MANAGER_MANUAL">{t("executionsSourceManual")}</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">{t("executionHistoryLoading")}</p>}
      {error && <p className="text-destructive">{t("executionHistoryError")}</p>}
      {!isLoading && !error && items.length === 0 && (
        <p className="text-muted-foreground">{t("executionHistoryEmpty")}</p>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground border-b">
              <tr>
                <th className="py-2 pr-3 font-medium">{t("executionHistoryColWorker")}</th>
                <th className="py-2 pr-3 font-medium">{t("executionHistoryColPoint")}</th>
                <th className="py-2 pr-3 font-medium">{t("executionHistoryColCheckIn")}</th>
                <th className="py-2 pr-3 font-medium">{t("executionHistoryColCheckOut")}</th>
                <th className="py-2 pr-3 font-medium">{t("executionHistoryColGeo")}</th>
                <th className="py-2 pr-3 font-medium">{t("executionHistoryColReview")}</th>
                <th className="py-2 pr-3 font-medium">{t("executionHistoryColSource")}</th>
                <th className="py-2 pr-3 font-medium">{t("executionHistoryColEvidence")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const geo = toGeoValidation(item.geo_validation);
                const review = toReviewBadge(item.review_status);

                return (
                  <tr
                    key={item.execution_id}
                    className="hover:bg-muted/50 cursor-pointer border-b"
                    onClick={() => {
                      setSelectedId(item.execution_id);
                    }}
                  >
                    <td className="py-2 pr-3">{item.field_worker_name}</td>
                    <td className="py-2 pr-3">
                      <span>{item.service_point_name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {item.building_name} · {item.floor_label}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{formatDateTime(item.checked_in_at)}</td>
                    <td className="py-2 pr-3">
                      {item.checked_out_at ? formatDateTime(item.checked_out_at) : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {geo ? (
                        <span className={`${BADGE_CLASS} ${GEO_BADGE[geo].className}`}>
                          {t(GEO_BADGE[geo].key)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {review && (
                        <span className={`${BADGE_CLASS} ${REVIEW_BADGE[review].className}`}>
                          {t(REVIEW_BADGE[review].key)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{t(SOURCE_LABEL_KEY[toSource(item.source)])}</td>
                    <td className="py-2 pr-3">{item.evidence_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span>
            {t("executionHistoryPaginationLabel")} {page} {t("executionHistoryPaginationOf")}{" "}
            {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border px-3 py-1 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              {t("executionHistoryPrevPage")}
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1 disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => {
                setPage((current) => current + 1);
              }}
            >
              {t("executionHistoryNextPage")}
            </button>
          </div>
        </div>
      )}

      {selectedId !== null && (
        <ExecutionDetailDrawer
          executionId={selectedId}
          onClose={() => {
            setSelectedId(null);
          }}
        />
      )}
    </main>
  );
}
