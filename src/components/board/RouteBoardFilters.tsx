import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/useTranslation";

export type RouteType = "REGULAR" | "OCCASIONAL";
export type RouteStatusFilter = "" | "PLANNED" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export interface RouteFilters {
  date: string;
  // Client-side: matched against the worker name in the loaded routes.
  workerQuery: string;
  // Client-side: the worker's contractor company (the API has no company filter on /routes).
  companyId: string;
  routeType: "" | RouteType;
  status: RouteStatusFilter;
}

interface RouteBoardFiltersProps {
  filters: RouteFilters;
  companies: { id: string; name: string }[];
  onChange: (patch: Partial<RouteFilters>) => void;
}

/** The board's filters. Native controls on purpose: the date picker and selects stay the
 * platform's own, on desktop and on a phone in the field. With 50–100 workers a day, the
 * worker select became a search box and the company is its own filter. */
export function RouteBoardFilters({ filters, companies, onChange }: RouteBoardFiltersProps) {
  const { t } = useTranslation();

  return (
    <fieldset className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
      <legend className="sr-only">{t("routeBoardFiltersLabel")}</legend>
      <div className="col-span-2 space-y-1.5 md:col-span-3 xl:col-span-1">
        <Label htmlFor="route-filter-worker">{t("routeBoardFilterWorkerSearch")}</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            id="route-filter-worker"
            type="search"
            className="pl-9"
            placeholder={t("routeBoardFilterWorkerPlaceholder")}
            value={filters.workerQuery}
            onChange={(event) => {
              onChange({ workerQuery: event.target.value });
            }}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="route-filter-date">{t("routeBoardFilterDate")}</Label>
        <Input
          id="route-filter-date"
          type="date"
          value={filters.date}
          onChange={(event) => {
            onChange({ date: event.target.value });
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="route-filter-company">{t("routeBoardFilterCompany")}</Label>
        <NativeSelect
          id="route-filter-company"
          value={filters.companyId}
          onChange={(event) => {
            onChange({ companyId: event.target.value });
          }}
        >
          <NativeSelectOption value="">{t("routeBoardFilterAll")}</NativeSelectOption>
          {companies.map((company) => (
            <NativeSelectOption key={company.id} value={company.id}>
              {company.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="route-filter-type">{t("routeBoardFilterType")}</Label>
        <NativeSelect
          id="route-filter-type"
          value={filters.routeType}
          onChange={(event) => {
            onChange({ routeType: event.target.value as RouteFilters["routeType"] });
          }}
        >
          <NativeSelectOption value="">{t("routeBoardFilterAll")}</NativeSelectOption>
          <NativeSelectOption value="REGULAR">{t("routeTypeRegular")}</NativeSelectOption>
          <NativeSelectOption value="OCCASIONAL">{t("routeTypeOccasional")}</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="route-filter-status">{t("routeBoardFilterStatus")}</Label>
        <NativeSelect
          id="route-filter-status"
          value={filters.status}
          onChange={(event) => {
            onChange({ status: event.target.value as RouteFilters["status"] });
          }}
        >
          <NativeSelectOption value="">{t("routeBoardFilterAll")}</NativeSelectOption>
          <NativeSelectOption value="PLANNED">{t("routeStatusPlanned")}</NativeSelectOption>
          <NativeSelectOption value="IN_PROGRESS">{t("routeStatusInProgress")}</NativeSelectOption>
          <NativeSelectOption value="DONE">{t("routeStatusDone")}</NativeSelectOption>
          <NativeSelectOption value="CANCELLED">{t("routeStatusCancelled")}</NativeSelectOption>
        </NativeSelect>
      </div>
    </fieldset>
  );
}
