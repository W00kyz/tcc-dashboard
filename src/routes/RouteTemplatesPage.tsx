import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { SortableStopList, type StopDraft } from "@/components/SortableStopList";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { toLocalIsoDate } from "@/lib/dates";

type ApiClient = ReturnType<typeof createApiClient>;
type Recurrence = "DAILY" | "WEEKLY";
type RouteType = "REGULAR" | "OCCASIONAL";
type TemplateOut = components["schemas"]["TemplateOut"];
type TemplateCreateBody = components["schemas"]["TemplateCreateBody"];

const SELECT_CLASS = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm";

// ISO weekday ints (Mon=1 .. Sun=7) — the backend's `RouteTemplate.weekdays` convention
// (app/domain/routing/templates.py). JS `Date.getDay()` is Sun=0 .. Sat=6, so Sunday folds
// to 7 in `isoWeekday` below.
const WEEKDAY_OPTIONS: readonly { iso: number; key: StringKey }[] = [
  { iso: 1, key: "routeTemplateWeekdayMon" },
  { iso: 2, key: "routeTemplateWeekdayTue" },
  { iso: 3, key: "routeTemplateWeekdayWed" },
  { iso: 4, key: "routeTemplateWeekdayThu" },
  { iso: 5, key: "routeTemplateWeekdayFri" },
  { iso: 6, key: "routeTemplateWeekdaySat" },
  { iso: 7, key: "routeTemplateWeekdaySun" },
];

function isoWeekday(date: Date): number {
  const day = date.getDay();

  return day === 0 ? 7 : day;
}

// The date the materialize dialog opens on: for WEEKLY, the first date from today (inclusive)
// whose ISO weekday the template recurs on; for DAILY — or a WEEKLY template with no weekdays
// — today. The manager can still override it in the dialog.
function nextMaterializeDate(recurrence: string, weekdays: number[] | null): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (recurrence !== "WEEKLY" || weekdays === null || weekdays.length === 0) {
    return toLocalIsoDate(start);
  }
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    if (weekdays.includes(isoWeekday(candidate))) {
      return toLocalIsoDate(candidate);
    }
  }

  return toLocalIsoDate(start);
}

// Templates carry a bare "HH:MM" time-of-day, never a datetime — unlike the route builder,
// which glues the route date in front and sends a Z-ISO instant. Empty means "no window".
function timeOrNull(value: string): string | null {
  return value === "" ? null : value;
}

function recurrenceLabelKey(recurrence: string): StringKey {
  return recurrence === "WEEKLY" ? "routeTemplateRecurrenceWeekly" : "routeTemplateRecurrenceDaily";
}

function TemplateCreateForm({ client }: { client: ApiClient }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("DAILY");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [routeType, setRouteType] = useState<RouteType>("REGULAR");
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [servicePointId, setServicePointId] = useState("");
  const [stops, setStops] = useState<StopDraft[]>([]);

  const { data: buildings } = useQuery({
    queryKey: ["buildings"],
    queryFn: async () => {
      const { data } = await client.GET("/buildings");

      return data ?? [];
    },
  });
  const { data: floors } = useQuery({
    queryKey: ["floors", buildingId],
    queryFn: async () => {
      const { data } = await client.GET("/floors", {
        params: { query: { building_id: buildingId } },
      });

      return data ?? [];
    },
    enabled: buildingId !== "",
  });
  const { data: servicePoints } = useQuery({
    queryKey: ["service-points", floorId],
    queryFn: async () => {
      const { data } = await client.GET("/service-points", {
        params: { query: { floor_id: floorId } },
      });

      return data ?? [];
    },
    enabled: floorId !== "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const body: TemplateCreateBody = {
        name,
        recurrence,
        route_type: routeType,
        // DAILY ignores `weekdays`; the backend nulls it anyway (route_templates.py).
        weekdays: recurrence === "WEEKLY" ? weekdays : null,
        stops: stops.map((stop) => ({
          service_point_id: stop.servicePointId,
          expected_arrival_from: timeOrNull(stop.expectedArrivalFrom),
          expected_arrival_to: timeOrNull(stop.expectedArrivalTo),
        })),
      };
      const { response } = await client.POST("/route-templates", { body });
      if (!response.ok) {
        throw new Error(`POST /route-templates failed with status ${String(response.status)}`);
      }
    },
    onSuccess: () => {
      setName("");
      setRecurrence("DAILY");
      setWeekdays([]);
      setRouteType("REGULAR");
      setStops([]);
      void queryClient.invalidateQueries({ queryKey: ["route-templates"] });
    },
  });

  function addPoint() {
    const point = servicePoints?.find((candidate) => candidate.id === servicePointId);
    if (point === undefined) {
      return;
    }
    setStops((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        servicePointId: point.id,
        servicePointName: point.name,
        expectedArrivalFrom: "",
        expectedArrivalTo: "",
      },
    ]);
    setServicePointId("");
  }

  function toggleWeekday(iso: number, checked: boolean) {
    setWeekdays((current) =>
      checked
        ? [...current, iso].sort((left, right) => left - right)
        : current.filter((day) => day !== iso),
    );
  }

  function editWindow(key: string, field: "from" | "to", value: string) {
    const property = field === "from" ? "expectedArrivalFrom" : "expectedArrivalTo";

    setStops((current) =>
      current.map((stop) => (stop.key === key ? { ...stop, [property]: value } : stop)),
    );
  }

  // The one submit guard the spec mandates: a WEEKLY template with no weekday checked has
  // nothing to recur on and the backend 422s it.
  const weekdayMissing = recurrence === "WEEKLY" && weekdays.length === 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (weekdayMissing) {
          return;
        }
        create.mutate();
      }}
    >
      <h2 className="text-lg font-medium">{t("routeTemplateNew")}</h2>

      {create.isError && (
        <p role="alert" className="text-destructive text-sm">
          {t("routeTemplateError")}
        </p>
      )}

      <div>
        <Label htmlFor="template-name">{t("routeTemplateNameLabel")}</Label>
        <Input
          id="template-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>

      <div>
        <Label htmlFor="template-recurrence">{t("routeTemplateRecurrenceLabel")}</Label>
        <select
          id="template-recurrence"
          className={SELECT_CLASS}
          value={recurrence}
          onChange={(event) => {
            setRecurrence(event.target.value as Recurrence);
          }}
        >
          <option value="DAILY">{t("routeTemplateRecurrenceDaily")}</option>
          <option value="WEEKLY">{t("routeTemplateRecurrenceWeekly")}</option>
        </select>
      </div>

      {recurrence === "WEEKLY" && (
        <fieldset>
          <legend className="text-sm leading-none font-medium">
            {t("routeTemplateWeekdaysLabel")}
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {WEEKDAY_OPTIONS.map((option) => (
              <Label key={option.iso} className="font-normal">
                <input
                  type="checkbox"
                  checked={weekdays.includes(option.iso)}
                  onChange={(event) => {
                    toggleWeekday(option.iso, event.target.checked);
                  }}
                />
                {t(option.key)}
              </Label>
            ))}
          </div>
        </fieldset>
      )}

      {weekdayMissing && (
        <p className="text-muted-foreground text-sm">{t("routeTemplateWeeklyHint")}</p>
      )}

      <div>
        <Label htmlFor="template-route-type">{t("routeTemplateRouteTypeLabel")}</Label>
        <select
          id="template-route-type"
          className={SELECT_CLASS}
          value={routeType}
          onChange={(event) => {
            setRouteType(event.target.value as RouteType);
          }}
        >
          <option value="REGULAR">{t("routeTypeRegular")}</option>
          <option value="OCCASIONAL">{t("routeTypeOccasional")}</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="template-building">{t("routeBuilderPickBuilding")}</Label>
          <select
            id="template-building"
            className={SELECT_CLASS}
            value={buildingId}
            onChange={(event) => {
              setBuildingId(event.target.value);
              setFloorId("");
              setServicePointId("");
            }}
          >
            <option value="" />
            {buildings?.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="template-floor">{t("routeBuilderPickFloor")}</Label>
          <select
            id="template-floor"
            className={SELECT_CLASS}
            value={floorId}
            onChange={(event) => {
              setFloorId(event.target.value);
              setServicePointId("");
            }}
          >
            <option value="" />
            {floors?.map((floor) => (
              <option key={floor.id} value={floor.id}>
                {floor.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <select
            aria-label={t("routeBuilderAddPoint")}
            className={SELECT_CLASS}
            value={servicePointId}
            onChange={(event) => {
              setServicePointId(event.target.value);
            }}
          >
            <option value="" />
            {servicePoints?.map((point) => (
              <option key={point.id} value={point.id}>
                {point.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" onClick={addPoint}>
            {t("routeBuilderAddPoint")}
          </Button>
        </div>
      </div>

      <SortableStopList
        stops={stops}
        onReorder={setStops}
        onRemove={(key) => {
          setStops((current) => current.filter((stop) => stop.key !== key));
        }}
        onEditWindow={editWindow}
      />

      <Button type="submit" disabled={weekdayMissing || create.isPending}>
        {t("routeTemplateSave")}
      </Button>
    </form>
  );
}

function MaterializeDialog({ client, template }: { client: ApiClient; template: TemplateOut }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [routeDate, setRouteDate] = useState(() =>
    nextMaterializeDate(template.recurrence, template.weekdays),
  );
  const [workerId, setWorkerId] = useState("");

  const { data: workers } = useQuery({
    queryKey: ["field-workers"],
    queryFn: async () => {
      const { data } = await client.GET("/field-workers");

      return data ?? [];
    },
    enabled: open,
  });

  const materialize = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/route-templates/{template_id}/materialize", {
        params: { path: { template_id: template.id } },
        body:
          workerId === ""
            ? { route_date: routeDate }
            : { route_date: routeDate, field_worker_id: workerId },
      });
      if (!response.ok) {
        throw new Error(
          `POST /route-templates/${template.id}/materialize failed with status ` +
            String(response.status),
        );
      }
    },
    onSuccess: () => {
      setOpen(false);

      // The board derives its filters from the URL (Task 11), so this lands already scoped to
      // the date the template was materialised for.
      void navigate(`/rotas?date=${routeDate}`);
    },
  });

  // Closing the dialog wipes the previous attempt and re-seeds the default date, mirroring
  // RouteActionsMenu's dialog reset.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      materialize.reset();
      setRouteDate(nextMaterializeDate(template.recurrence, template.weekdays));
      setWorkerId("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("routeTemplateMaterialize")}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{t("routeTemplateMaterializeTitle")}</DialogTitle>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            materialize.mutate();
          }}
        >
          <div>
            <Label htmlFor={`materialize-date-${template.id}`}>
              {t("routeTemplateMaterializeDateLabel")}
            </Label>
            <Input
              id={`materialize-date-${template.id}`}
              type="date"
              value={routeDate}
              onChange={(event) => {
                setRouteDate(event.target.value);
              }}
            />
          </div>
          <div>
            <Label htmlFor={`materialize-worker-${template.id}`}>
              {t("routeTemplateMaterializeWorkerLabel")}
            </Label>
            <select
              id={`materialize-worker-${template.id}`}
              className={SELECT_CLASS}
              value={workerId}
              onChange={(event) => {
                setWorkerId(event.target.value);
              }}
            >
              <option value="" />
              {workers?.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.full_name}
                </option>
              ))}
            </select>
          </div>
          {materialize.isError && (
            <p role="alert" className="text-destructive text-sm">
              {t("routeTemplateError")}
            </p>
          )}
          <Button type="submit" size="sm" disabled={routeDate === "" || materialize.isPending}>
            {t("routeTemplateMaterializeSubmit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplateRow({ client, template }: { client: ApiClient; template: TemplateOut }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { response } = await client.PATCH("/route-templates/{template_id}", {
        params: { path: { template_id: template.id } },
        body: { is_active: !template.is_active },
      });
      if (!response.ok) {
        throw new Error(
          `PATCH /route-templates/${template.id} failed with status ${String(response.status)}`,
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["route-templates"] });
    },
  });

  const recurringWeekdays = WEEKDAY_OPTIONS.filter((option) =>
    template.weekdays?.includes(option.iso),
  );

  return (
    <li
      data-testid={`template-row-${template.id}`}
      className="flex flex-wrap items-center gap-3 py-2"
    >
      <span className="flex-1 font-medium">{template.name}</span>
      <span className="text-muted-foreground text-sm">
        {t(recurrenceLabelKey(template.recurrence))}
      </span>
      {template.recurrence === "WEEKLY" && recurringWeekdays.length > 0 && (
        <span className="text-muted-foreground text-sm">
          {recurringWeekdays.map((option) => t(option.key)).join(" ")}
        </span>
      )}
      <Label className="font-normal">
        <input
          type="checkbox"
          checked={template.is_active}
          disabled={toggleActive.isPending}
          onChange={() => {
            toggleActive.mutate();
          }}
        />
        {t("routeTemplateActiveLabel")}
      </Label>
      {toggleActive.isError && (
        <span role="alert" className="text-destructive text-sm">
          {t("routeTemplateToggleError")}
        </span>
      )}
      <MaterializeDialog client={client} template={template} />
    </li>
  );
}

export function RouteTemplatesPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  // Mirrors the other pages' convention: fall back to an empty token instead of asserting a
  // non-null session, so the page renders (and its requests fail cleanly) before hydration.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data: templates } = useQuery({
    queryKey: ["route-templates"],
    queryFn: async () => {
      const { data } = await client.GET("/route-templates");

      return data ?? [];
    },
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("routeTemplatePageTitle")}</h1>

      <TemplateCreateForm client={client} />

      <ul className="divide-border divide-y">
        {templates?.map((template) => (
          <TemplateRow key={template.id} client={client} template={template} />
        ))}
      </ul>
    </main>
  );
}
