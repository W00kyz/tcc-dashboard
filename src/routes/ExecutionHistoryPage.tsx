import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { ExecutionDetailDrawer } from "@/components/ExecutionDetailDrawer";
import { Label } from "@/components/ui/label";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { toLocalIsoDate } from "@/lib/dates";
import { Page, PageHeader } from "@/components/layout/Page";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState, ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ApiClient = ReturnType<typeof createApiClient>;

type ReviewStatus = "PENDING_REVIEW" | "RESOLVED" | "NONE";
type GeoValidation = "VALIDATED" | "OUT_OF_RADIUS" | "NOT_VALIDATED";
type ExecutionSource = "APP" | "MANAGER_MANUAL";

interface ExecutionFilters {
  dateFrom: string;
  dateTo: string;
  fieldWorkerId: string;
  servicePointId: string;
  serviceTypeId: string;
  buildingId: string;
  reviewStatus: "" | ReviewStatus;
  geoValidation: "" | GeoValidation;
  source: "" | ExecutionSource;
}

const PAGE_SIZE = 50;
const DEFAULT_WINDOW_DAYS = 7;

// Same green/amber/grey vocabulary as RouteBoardPage's STATUS_PILL: a validated scan reads
// as "good", out-of-radius as "needs a look", not-validated as neutral/missing.
const GEO_BADGE: Record<GeoValidation, { key: StringKey; tone: BadgeTone }> = {
  VALIDATED: { key: "executionsGeoValidated", tone: "done" },
  OUT_OF_RADIUS: { key: "executionsGeoOutOfRadius", tone: "progress" },
  NOT_VALIDATED: { key: "executionsGeoNotValidated", tone: "pending" },
};

// NONE is deliberately absent: an execution with nothing to review shows no pill at all.
const REVIEW_BADGE: Record<"PENDING_REVIEW" | "RESOLVED", { key: StringKey; tone: BadgeTone }> = {
  PENDING_REVIEW: { key: "executionsReviewPending", tone: "signal" },
  RESOLVED: { key: "executionsReviewResolved", tone: "done" },
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
    serviceTypeId: params.get("service_type_id") ?? "",
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
    ["service_type_id", filters.serviceTypeId],
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
        service_type_id: filters.serviceTypeId || undefined,
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

  const { data: serviceTypes } = useQuery({
    queryKey: ["service-types"],
    queryFn: async () => {
      const { data } = await client.GET("/service-types");

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
    // Keep the previous page's rows (and the pagination controls) mounted while the next
    // page loads — otherwise "Próxima" unmounts itself mid-click and focus is lost. The
    // first load still has no previous data, so `isLoading` renders the spinner as before.
    placeholderData: keepPreviousData,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const total = executions?.total ?? 0;
  const items = executions?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Page width="wide">
      <PageHeader title={t("executionHistoryTitle")} />

      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <legend className="sr-only">{t("routeBoardFiltersLabel")}</legend>
        <div className="space-y-1.5">
          <Label htmlFor="execution-filter-date-from">{t("executionsFilterDateFrom")}</Label>
          <Input
            id="execution-filter-date-from"
            type="date"
            value={filters.dateFrom}
            onChange={(event) => {
              updateFilters({ dateFrom: event.target.value });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="execution-filter-date-to">{t("executionsFilterDateTo")}</Label>
          <Input
            id="execution-filter-date-to"
            type="date"
            value={filters.dateTo}
            onChange={(event) => {
              updateFilters({ dateTo: event.target.value });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="execution-filter-worker">{t("executionsFilterWorker")}</Label>
          <NativeSelect
            id="execution-filter-worker"
            value={filters.fieldWorkerId}
            onChange={(event) => {
              updateFilters({ fieldWorkerId: event.target.value });
            }}
          >
            <NativeSelectOption value="">{t("executionsFilterAll")}</NativeSelectOption>
            {workers?.map((worker) => (
              <NativeSelectOption key={worker.id} value={worker.id}>
                {worker.full_name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="execution-filter-service-type">{t("executionsFilterServiceType")}</Label>
          <NativeSelect
            id="execution-filter-service-type"
            value={filters.serviceTypeId}
            onChange={(event) => {
              updateFilters({ serviceTypeId: event.target.value });
            }}
          >
            <NativeSelectOption value="">{t("executionsFilterAll")}</NativeSelectOption>
            {serviceTypes?.map((serviceType) => (
              <NativeSelectOption key={serviceType.id} value={serviceType.id}>
                {serviceType.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="execution-filter-building">{t("executionsFilterBuilding")}</Label>
          <NativeSelect
            id="execution-filter-building"
            value={filters.buildingId}
            onChange={(event) => {
              updateFilters({ buildingId: event.target.value });
            }}
          >
            <NativeSelectOption value="">{t("executionsFilterAll")}</NativeSelectOption>
            {buildings?.map((building) => (
              <NativeSelectOption key={building.id} value={building.id}>
                {building.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="execution-filter-review">{t("executionsFilterReviewStatus")}</Label>
          <NativeSelect
            id="execution-filter-review"
            value={filters.reviewStatus}
            onChange={(event) => {
              updateFilters({
                reviewStatus: event.target.value as ExecutionFilters["reviewStatus"],
              });
            }}
          >
            <NativeSelectOption value="">{t("executionsFilterAll")}</NativeSelectOption>
            <NativeSelectOption value="PENDING_REVIEW">
              {t("executionsReviewPending")}
            </NativeSelectOption>
            <NativeSelectOption value="RESOLVED">
              {t("executionsReviewResolved")}
            </NativeSelectOption>
            <NativeSelectOption value="NONE">{t("executionsReviewNone")}</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="execution-filter-geo">{t("executionsFilterGeoValidation")}</Label>
          <NativeSelect
            id="execution-filter-geo"
            value={filters.geoValidation}
            onChange={(event) => {
              updateFilters({
                geoValidation: event.target.value as ExecutionFilters["geoValidation"],
              });
            }}
          >
            <NativeSelectOption value="">{t("executionsFilterAll")}</NativeSelectOption>
            <NativeSelectOption value="VALIDATED">{t("executionsGeoValidated")}</NativeSelectOption>
            <NativeSelectOption value="OUT_OF_RADIUS">
              {t("executionsGeoOutOfRadius")}
            </NativeSelectOption>
            <NativeSelectOption value="NOT_VALIDATED">
              {t("executionsGeoNotValidated")}
            </NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="execution-filter-source">{t("executionsFilterSource")}</Label>
          <NativeSelect
            id="execution-filter-source"
            value={filters.source}
            onChange={(event) => {
              updateFilters({ source: event.target.value as ExecutionFilters["source"] });
            }}
          >
            <NativeSelectOption value="">{t("executionsFilterAll")}</NativeSelectOption>
            <NativeSelectOption value="APP">{t("executionsSourceApp")}</NativeSelectOption>
            <NativeSelectOption value="MANAGER_MANUAL">
              {t("executionsSourceManual")}
            </NativeSelectOption>
          </NativeSelect>
        </div>
      </fieldset>

      {isLoading && <LoadingMessage>{t("executionHistoryLoading")}</LoadingMessage>}
      {error && <ErrorMessage>{t("executionHistoryError")}</ErrorMessage>}
      {!isLoading && !error && items.length === 0 && (
        <EmptyState>{t("executionHistoryEmpty")}</EmptyState>
      )}

      {items.length > 0 && (
        <div className="bg-card rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("executionHistoryColWorker")}</TableHead>
                <TableHead>{t("executionHistoryColPoint")}</TableHead>
                <TableHead>{t("executionHistoryColCheckIn")}</TableHead>
                <TableHead>{t("executionHistoryColCheckOut")}</TableHead>
                <TableHead>{t("executionHistoryColGeo")}</TableHead>
                <TableHead>{t("executionHistoryColReview")}</TableHead>
                <TableHead>{t("executionHistoryColSource")}</TableHead>
                <TableHead className="text-right">{t("executionHistoryColEvidence")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const geo = toGeoValidation(item.geo_validation);
                const review = toReviewBadge(item.review_status);

                return (
                  <TableRow
                    key={item.execution_id}
                    className="focus-visible:bg-accent cursor-pointer focus-visible:outline-offset-[-2px]"
                    role="button"
                    tabIndex={0}
                    aria-label={`${t("executionHistoryRowAria")} ${item.field_worker_name}`}
                    onClick={() => {
                      setSelectedId(item.execution_id);
                    }}
                    onKeyDown={(event) => {
                      // Row acts as a button: open the drawer on Enter/Space. preventDefault on
                      // Space stops the page from scrolling; on Enter it is harmless.
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(item.execution_id);
                      }
                    }}
                  >
                    <TableCell className="text-primary font-semibold">
                      {item.field_worker_name}
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{item.service_point_name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {item.building_name} · {item.floor_label}
                      </span>
                    </TableCell>
                    <TableCell>{formatDateTime(item.checked_in_at)}</TableCell>
                    <TableCell>
                      {item.checked_out_at ? formatDateTime(item.checked_out_at) : "—"}
                    </TableCell>
                    <TableCell>
                      {geo ? (
                        <Badge variant={GEO_BADGE[geo].tone}>{t(GEO_BADGE[geo].key)}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {review && (
                        <Badge variant={REVIEW_BADGE[review].tone}>
                          {t(REVIEW_BADGE[review].key)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{t(SOURCE_LABEL_KEY[toSource(item.source)])}</TableCell>
                    <TableCell className="text-right">{item.evidence_count}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("executionHistoryPaginationLabel")} {page} {t("executionHistoryPaginationOf")}{" "}
            {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              <ChevronLeft aria-hidden="true" />
              {t("executionHistoryPrevPage")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => {
                setPage((current) => current + 1);
              }}
            >
              {t("executionHistoryNextPage")}
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      <ExecutionDetailDrawer
        executionId={selectedId}
        onClose={() => {
          setSelectedId(null);
        }}
      />
    </Page>
  );
}
