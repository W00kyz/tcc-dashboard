import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { authAwareFetch } from "@/api/authFetch";
import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { Label } from "@/components/ui/label";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ComplianceReportTable } from "@/components/reports/ComplianceReportTable";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { EmptyState, ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ApiClient = ReturnType<typeof createApiClient>;
type ComplianceReport = components["schemas"]["ComplianceReportOut"];
type Granularity = components["schemas"]["ReportGranularity"];
type Outcome = "DONE" | "DONE_BY_APPEAL" | "UNSERVED";

interface ReportFilters {
  granularity: Granularity;
  dateFrom: string;
  dateTo: string;
  fieldWorkerId: string;
  companyId: string;
  serviceTypeId: string;
  buildingId: string;
  outcome: "" | Outcome;
}

const GRANULARITY_OPTIONS: { value: Granularity; key: StringKey }[] = [
  { value: "DAILY", key: "reportsGranularityDaily" },
  { value: "WEEKLY", key: "reportsGranularityWeekly" },
  { value: "MONTHLY", key: "reportsGranularityMonthly" },
];

// The RF44 "status" axis is the point-day outcome (spec 2026-10-20-alocacao-automatica §8.7); the
// labels match the ones the API echoes back in `filters_applied.outcome`.
const OUTCOME_OPTIONS: { value: Outcome; key: StringKey }[] = [
  { value: "DONE", key: "reportsOutcomeDone" },
  { value: "DONE_BY_APPEAL", key: "reportsOutcomeDoneByAppeal" },
  { value: "UNSERVED", key: "reportsOutcomeUnserved" },
];

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
  if (filters.companyId) {
    qs.set("company_id", filters.companyId);
  }
  if (filters.serviceTypeId) {
    qs.set("service_type_id", filters.serviceTypeId);
  }
  if (filters.buildingId) {
    qs.set("building_id", filters.buildingId);
  }
  if (filters.outcome) {
    qs.set("outcome", filters.outcome);
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
        company_id: filters.companyId || undefined,
        service_type_id: filters.serviceTypeId || undefined,
        building_id: filters.buildingId || undefined,
        outcome: filters.outcome || undefined,
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
    applied.company_name,
    applied.service_type_name,
    applied.building_name,
    applied.outcome,
  ].filter((value): value is string => Boolean(value));

  return (
    <p className="text-muted-foreground text-xs">
      {t("reportsFiltersAppliedPrefix")}{" "}
      {parts.length > 0 ? parts.join(" · ") : t("reportsFiltersAppliedNone")}
    </p>
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
    companyId: "",
    serviceTypeId: "",
    buildingId: "",
    outcome: "",
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
  const { data: companies } = useQuery({
    queryKey: ["contractor-companies"],
    queryFn: async () => (await client.GET("/contractor-companies")).data ?? [],
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
      const res = await authAwareFetch(
        `${apiBaseUrl}/reports/compliance.${format}?${qs.toString()}`,
        {
          headers: { Authorization: `Bearer ${session?.accessToken ?? ""}` },
        },
      );
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
    <Page width="wide">
      <PageHeader title={t("reportsTitle")} />

      <section
        aria-label={t("reportsParametersLabel")}
        className="bg-card space-y-5 rounded-md border p-4 sm:p-5"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <div className="space-y-1.5">
            <Label htmlFor="report-date-from">{t("reportsFilterDateFrom")}</Label>
            <Input
              id="report-date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(event) => {
                updateFilters({ dateFrom: event.target.value });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-date-to">{t("reportsFilterDateTo")}</Label>
            <Input
              id="report-date-to"
              type="date"
              value={filters.dateTo}
              onChange={(event) => {
                updateFilters({ dateTo: event.target.value });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-worker">{t("reportsFilterWorker")}</Label>
            <NativeSelect
              id="report-worker"
              value={filters.fieldWorkerId}
              onChange={(event) => {
                updateFilters({ fieldWorkerId: event.target.value });
              }}
            >
              <NativeSelectOption value="">{t("reportsFilterAll")}</NativeSelectOption>
              {workers?.map((worker) => (
                <NativeSelectOption key={worker.id} value={worker.id}>
                  {worker.full_name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-company">{t("reportsFilterCompany")}</Label>
            <NativeSelect
              id="report-company"
              value={filters.companyId}
              onChange={(event) => {
                updateFilters({ companyId: event.target.value });
              }}
            >
              <NativeSelectOption value="">{t("reportsFilterAll")}</NativeSelectOption>
              {companies?.map((company) => (
                <NativeSelectOption key={company.id} value={company.id}>
                  {company.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-service-type">{t("reportsFilterServiceType")}</Label>
            <NativeSelect
              id="report-service-type"
              value={filters.serviceTypeId}
              onChange={(event) => {
                updateFilters({ serviceTypeId: event.target.value });
              }}
            >
              <NativeSelectOption value="">{t("reportsFilterAll")}</NativeSelectOption>
              {serviceTypes?.map((serviceType) => (
                <NativeSelectOption key={serviceType.id} value={serviceType.id}>
                  {serviceType.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-building">{t("reportsFilterBuilding")}</Label>
            <NativeSelect
              id="report-building"
              value={filters.buildingId}
              onChange={(event) => {
                updateFilters({ buildingId: event.target.value });
              }}
            >
              <NativeSelectOption value="">{t("reportsFilterAll")}</NativeSelectOption>
              {buildings?.map((building) => (
                <NativeSelectOption key={building.id} value={building.id}>
                  {building.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-outcome">{t("reportsFilterOutcome")}</Label>
            <NativeSelect
              id="report-outcome"
              value={filters.outcome}
              onChange={(event) => {
                updateFilters({ outcome: event.target.value as ReportFilters["outcome"] });
              }}
            >
              <NativeSelectOption value="">{t("reportsFilterAll")}</NativeSelectOption>
              {OUTCOME_OPTIONS.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {t(option.key)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 border-t pt-4">
          <div className="space-y-1.5">
            <span className="text-sm font-semibold">{t("reportsGranularityLabel")}</span>
            <div
              className="bg-muted flex gap-1 rounded-md p-1"
              role="group"
              aria-label={t("reportsGranularityLabel")}
            >
              {GRANULARITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filters.granularity === option.value}
                  className="text-muted-foreground hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground rounded-[4px] px-3 py-1.5 text-sm font-semibold transition-colors"
                  onClick={() => {
                    updateFilters({ granularity: option.value });
                  }}
                >
                  {t(option.key)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!rangeValid}
              onClick={() => {
                void downloadReport("pdf");
              }}
            >
              <FileDown aria-hidden="true" />
              {t("reportsExportPdf")}
            </Button>
            <Button
              variant="outline"
              disabled={!rangeValid}
              onClick={() => {
                void downloadReport("xlsx");
              }}
            >
              <FileSpreadsheet aria-hidden="true" />
              {t("reportsExportXlsx")}
            </Button>
            <Button
              disabled={!rangeValid}
              onClick={() => {
                setGeneratedFilters(filters);
              }}
            >
              {t("reportsGenerate")}
            </Button>
          </div>
        </div>
      </section>

      {exportError && <ErrorMessage>{exportError}</ErrorMessage>}

      {reportQuery.isLoading && <LoadingMessage>{t("reportsLoading")}</LoadingMessage>}
      {reportQuery.isError && <ErrorMessage>{t("reportsError")}</ErrorMessage>}

      {reportQuery.data && (
        <div className="space-y-2">
          <FiltersAppliedCaption report={reportQuery.data} />
          {reportQuery.data.periods.length === 0 ? (
            <EmptyState>{t("reportsEmpty")}</EmptyState>
          ) : (
            <ComplianceReportTable report={reportQuery.data} />
          )}
        </div>
      )}
    </Page>
  );
}
