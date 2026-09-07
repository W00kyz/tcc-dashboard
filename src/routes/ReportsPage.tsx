import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { Label } from "@/components/ui/label";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";

type ApiClient = ReturnType<typeof createApiClient>;
type ComplianceReport = components["schemas"]["ComplianceReportOut"];
type ComplianceTotals = components["schemas"]["ComplianceTotalsOut"];
type Granularity = components["schemas"]["ReportGranularity"];

interface ReportFilters {
  granularity: Granularity;
  dateFrom: string;
  dateTo: string;
  fieldWorkerId: string;
  serviceTypeId: string;
  buildingId: string;
  routeStatus: string;
}

const GRANULARITY_OPTIONS: { value: Granularity; key: StringKey }[] = [
  { value: "DAILY", key: "reportsGranularityDaily" },
  { value: "WEEKLY", key: "reportsGranularityWeekly" },
  { value: "MONTHLY", key: "reportsGranularityMonthly" },
];

const ROUTE_STATUS_OPTIONS: { value: string; key: StringKey }[] = [
  { value: "PLANNED", key: "reportsRouteStatusPlanned" },
  { value: "IN_PROGRESS", key: "reportsRouteStatusInProgress" },
  { value: "DONE", key: "reportsRouteStatusDone" },
  { value: "CANCELLED", key: "reportsRouteStatusCancelled" },
];

// Column order mirrors `ComplianceRowOut` / `ComplianceTotalsOut`: the 13 absolute indicators,
// then `completion_rate` rendered separately as a percentage.
const METRIC_COLUMNS: { field: keyof ComplianceTotals; key: StringKey }[] = [
  { field: "routes_total", key: "reportsColRoutesTotal" },
  { field: "routes_started", key: "reportsColRoutesStarted" },
  { field: "routes_completed", key: "reportsColRoutesCompleted" },
  { field: "routes_cancelled", key: "reportsColRoutesCancelled" },
  { field: "stops_total", key: "reportsColStopsTotal" },
  { field: "stops_done", key: "reportsColStopsDone" },
  { field: "stops_pending", key: "reportsColStopsPending" },
  { field: "stops_reassigned", key: "reportsColStopsReassigned" },
  { field: "executions_total", key: "reportsColExecutionsTotal" },
  { field: "executions_with_evidence", key: "reportsColExecutionsWithEvidence" },
  { field: "executions_flagged", key: "reportsColExecutionsFlagged" },
  { field: "impediments_total", key: "reportsColImpediments" },
  { field: "alerts_total", key: "reportsColAlerts" },
];

const CONTROL_CLASS = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm";

// "87,3%" — one decimal, pt-BR comma. `completion_rate` is a 0..1 ratio from the builder.
function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1).replace(".", ",")}%`;
}

function isRangeValid(filters: ReportFilters): boolean {
  return filters.dateFrom !== "" && filters.dateTo !== "" && filters.dateTo >= filters.dateFrom;
}

function buildExportQuery(filters: ReportFilters): URLSearchParams {
  const qs = new URLSearchParams({
    granularity: filters.granularity,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
  });
  if (filters.fieldWorkerId) {
    qs.set("field_worker_id", filters.fieldWorkerId);
  }
  if (filters.serviceTypeId) {
    qs.set("service_type_id", filters.serviceTypeId);
  }
  if (filters.buildingId) {
    qs.set("building_id", filters.buildingId);
  }
  if (filters.routeStatus) {
    qs.set("route_status", filters.routeStatus);
  }

  return qs;
}

async function fetchComplianceReport(
  client: ApiClient,
  filters: ReportFilters,
): Promise<ComplianceReport> {
  const { data, response } = await client.GET("/reports/compliance", {
    params: {
      query: {
        granularity: filters.granularity,
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
        // Empty string would 422; send `undefined` so openapi-fetch omits the param.
        field_worker_id: filters.fieldWorkerId || undefined,
        service_type_id: filters.serviceTypeId || undefined,
        building_id: filters.buildingId || undefined,
        route_status: filters.routeStatus || undefined,
      },
    },
  });
  if (!response.ok || data === undefined) {
    throw new Error(`GET /reports/compliance failed (${String(response.status)}).`);
  }

  return data;
}

function FiltersAppliedCaption({ report }: { report: ComplianceReport }) {
  const { t } = useTranslation();
  const applied = report.filters_applied;
  const parts = [
    applied.field_worker_name,
    applied.service_type_name,
    applied.building_name,
    applied.route_status,
  ].filter((value): value is string => Boolean(value));

  return (
    <p className="text-muted-foreground text-xs">
      {t("reportsFiltersAppliedPrefix")}{" "}
      {parts.length > 0 ? parts.join(" · ") : t("reportsFiltersAppliedNone")}
    </p>
  );
}

function ReportTable({ report }: { report: ComplianceReport }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground border-b">
          <tr>
            <th className="py-2 pr-3 font-medium">{t("reportsColPeriod")}</th>
            {METRIC_COLUMNS.map((column) => (
              <th key={column.field} className="py-2 pr-3 text-right font-medium">
                {t(column.key)}
              </th>
            ))}
            <th className="py-2 pr-3 text-right font-medium">{t("reportsColCompletionRate")}</th>
          </tr>
        </thead>
        <tbody>
          {report.periods.map((period) => (
            <tr key={period.period_start} className="border-b">
              <td className="py-2 pr-3">{period.period_label}</td>
              {METRIC_COLUMNS.map((column) => (
                <td key={column.field} className="py-2 pr-3 text-right">
                  {period[column.field]}
                </td>
              ))}
              <td className="py-2 pr-3 text-right">{formatRate(period.completion_rate)}</td>
            </tr>
          ))}
          <tr className="border-b font-bold">
            <td className="py-2 pr-3">{t("reportsTotalsRow")}</td>
            {METRIC_COLUMNS.map((column) => (
              <td key={column.field} className="py-2 pr-3 text-right">
                {report.totals[column.field]}
              </td>
            ))}
            <td className="py-2 pr-3 text-right">{formatRate(report.totals.completion_rate)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ReportsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();

  // Mirrors the other pages: fall back to an empty token instead of asserting a non-null
  // session, so the page renders (and its requests fail cleanly) before hydration.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const [filters, setFilters] = useState<ReportFilters>({
    granularity: "DAILY",
    dateFrom: "",
    dateTo: "",
    fieldWorkerId: "",
    serviceTypeId: "",
    buildingId: "",
    routeStatus: "",
  });
  // The report is on demand: a snapshot of the filters taken when "Gerar" is clicked keys the
  // query and enables it. Editing filters afterwards does not refetch until "Gerar" again.
  const [generatedFilters, setGeneratedFilters] = useState<ReportFilters | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  function updateFilters(patch: Partial<ReportFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  const { data: workers } = useQuery({
    queryKey: ["field-workers"],
    queryFn: async () => (await client.GET("/field-workers")).data ?? [],
  });
  const { data: serviceTypes } = useQuery({
    queryKey: ["service-types"],
    queryFn: async () => (await client.GET("/service-types")).data ?? [],
  });
  const { data: buildings } = useQuery({
    queryKey: ["buildings"],
    queryFn: async () => (await client.GET("/buildings")).data ?? [],
  });

  const reportQuery = useQuery({
    queryKey: ["compliance-report", generatedFilters],
    queryFn: () => {
      if (generatedFilters === null) {
        throw new Error("compliance report requested before filters were generated.");
      }

      return fetchComplianceReport(client, generatedFilters);
    },
    enabled: generatedFilters !== null,
  });

  const rangeValid = isRangeValid(filters);

  // The export buttons use the CURRENT filter values, independent of whether a report was
  // generated — they hit `.pdf`/`.xlsx` directly, so there is nothing to keep in sync.
  async function downloadReport(format: "pdf" | "xlsx") {
    setExportError(null);
    const qs = buildExportQuery(filters);
    // A transport-level `fetch` rejection (offline, DNS failure) never reaches the `!res.ok`
    // branch — without this catch the `void` call site swallows it and the user sees nothing.
    try {
      const res = await fetch(`${apiBaseUrl}/reports/compliance.${format}?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${session?.accessToken ?? ""}` },
      });
      if (!res.ok) {
        setExportError(t("reportsExportError"));

        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `relatorio-conformidade-${filters.dateFrom}-${filters.dateTo}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Bound the blob-URL leak; the download has already started synchronously on click.
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch {
      setExportError(t("reportsExportError"));
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("reportsTitle")}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <Label htmlFor="report-date-from">{t("reportsFilterDateFrom")}</Label>
          <input
            id="report-date-from"
            type="date"
            className={CONTROL_CLASS}
            value={filters.dateFrom}
            onChange={(event) => {
              updateFilters({ dateFrom: event.target.value });
            }}
          />
        </div>
        <div>
          <Label htmlFor="report-date-to">{t("reportsFilterDateTo")}</Label>
          <input
            id="report-date-to"
            type="date"
            className={CONTROL_CLASS}
            value={filters.dateTo}
            onChange={(event) => {
              updateFilters({ dateTo: event.target.value });
            }}
          />
        </div>
        <div>
          <Label htmlFor="report-worker">{t("reportsFilterWorker")}</Label>
          <select
            id="report-worker"
            className={CONTROL_CLASS}
            value={filters.fieldWorkerId}
            onChange={(event) => {
              updateFilters({ fieldWorkerId: event.target.value });
            }}
          >
            <option value="">{t("reportsFilterAll")}</option>
            {workers?.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="report-service-type">{t("reportsFilterServiceType")}</Label>
          <select
            id="report-service-type"
            className={CONTROL_CLASS}
            value={filters.serviceTypeId}
            onChange={(event) => {
              updateFilters({ serviceTypeId: event.target.value });
            }}
          >
            <option value="">{t("reportsFilterAll")}</option>
            {serviceTypes?.map((serviceType) => (
              <option key={serviceType.id} value={serviceType.id}>
                {serviceType.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="report-building">{t("reportsFilterBuilding")}</Label>
          <select
            id="report-building"
            className={CONTROL_CLASS}
            value={filters.buildingId}
            onChange={(event) => {
              updateFilters({ buildingId: event.target.value });
            }}
          >
            <option value="">{t("reportsFilterAll")}</option>
            {buildings?.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="report-route-status">{t("reportsFilterRouteStatus")}</Label>
          <select
            id="report-route-status"
            className={CONTROL_CLASS}
            value={filters.routeStatus}
            onChange={(event) => {
              updateFilters({ routeStatus: event.target.value });
            }}
          >
            <option value="">{t("reportsFilterAll")}</option>
            {ROUTE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.key)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <span className="text-sm font-medium">{t("reportsGranularityLabel")}</span>
          <div className="mt-1 flex gap-1" role="group" aria-label={t("reportsGranularityLabel")}>
            {GRANULARITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filters.granularity === option.value}
                className={`rounded border px-3 py-1 text-sm ${
                  filters.granularity === option.value
                    ? "bg-foreground text-background"
                    : "bg-transparent"
                }`}
                onClick={() => {
                  updateFilters({ granularity: option.value });
                }}
              >
                {t(option.key)}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={!rangeValid}
          onClick={() => {
            setGeneratedFilters(filters);
          }}
        >
          {t("reportsGenerate")}
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={!rangeValid}
          onClick={() => {
            void downloadReport("pdf");
          }}
        >
          {t("reportsExportPdf")}
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={!rangeValid}
          onClick={() => {
            void downloadReport("xlsx");
          }}
        >
          {t("reportsExportXlsx")}
        </button>
      </div>

      {exportError && <p className="text-destructive text-sm">{exportError}</p>}

      {reportQuery.isLoading && <p className="text-muted-foreground">{t("reportsLoading")}</p>}
      {reportQuery.isError && <p className="text-destructive">{t("reportsError")}</p>}

      {reportQuery.data && (
        <div className="space-y-2">
          <FiltersAppliedCaption report={reportQuery.data} />
          {reportQuery.data.periods.length === 0 ? (
            <p className="text-muted-foreground">{t("reportsEmpty")}</p>
          ) : (
            <ReportTable report={reportQuery.data} />
          )}
        </div>
      )}
    </main>
  );
}
