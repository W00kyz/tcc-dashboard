import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { SortableStopList, type StopDraft } from "@/components/SortableStopList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { TemplateRow } from "@/components/templates/TemplateRow";
import { timeOrNull, WEEKDAY_OPTIONS } from "@/components/templates/templateSchedule";
import { EmptyState } from "@/components/layout/StateMessages";

type ApiClient = ReturnType<typeof createApiClient>;
type Recurrence = "DAILY" | "WEEKLY";
type RouteType = "REGULAR" | "OCCASIONAL";
type TemplateCreateBody = components["schemas"]["TemplateCreateBody"];

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
        // Templates don't carry a per-stop service type (that's a route-builder concern,
        // Task 8) — always blank here, and the row below never offers the picker.
        serviceTypeId: "",
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
      aria-labelledby="template-form-heading"
      className="bg-card rounded-md border"
      onSubmit={(event) => {
        event.preventDefault();
        if (weekdayMissing) {
          return;
        }
        create.mutate();
      }}
    >
      <h2
        id="template-form-heading"
        className="text-primary border-b px-4 py-3 text-base font-bold"
      >
        {t("routeTemplateNew")}
      </h2>

      <div className="space-y-4 p-4">
        {create.isError && <ErrorMessage>{t("routeTemplateError")}</ErrorMessage>}

        <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">{t("routeTemplateNameLabel")}</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-recurrence">{t("routeTemplateRecurrenceLabel")}</Label>
              <NativeSelect
                id="template-recurrence"
                value={recurrence}
                onChange={(event) => {
                  setRecurrence(event.target.value as Recurrence);
                }}
              >
                <NativeSelectOption value="DAILY">
                  {t("routeTemplateRecurrenceDaily")}
                </NativeSelectOption>
                <NativeSelectOption value="WEEKLY">
                  {t("routeTemplateRecurrenceWeekly")}
                </NativeSelectOption>
              </NativeSelect>
            </div>

            {recurrence === "WEEKLY" && (
              <fieldset>
                <legend className="text-sm leading-none font-semibold">
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

            <div className="space-y-1.5">
              <Label htmlFor="template-route-type">{t("routeTemplateRouteTypeLabel")}</Label>
              <NativeSelect
                id="template-route-type"
                value={routeType}
                onChange={(event) => {
                  setRouteType(event.target.value as RouteType);
                }}
              >
                <NativeSelectOption value="REGULAR">{t("routeTypeRegular")}</NativeSelectOption>
                <NativeSelectOption value="OCCASIONAL">
                  {t("routeTypeOccasional")}
                </NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 border-b pb-4 sm:grid-cols-[1fr_1fr_1.4fr]">
              <div className="space-y-1.5">
                <Label htmlFor="template-building">{t("routeBuilderPickBuilding")}</Label>
                <NativeSelect
                  id="template-building"
                  value={buildingId}
                  onChange={(event) => {
                    setBuildingId(event.target.value);
                    setFloorId("");
                    setServicePointId("");
                  }}
                >
                  <NativeSelectOption value="" />
                  {buildings?.map((building) => (
                    <NativeSelectOption key={building.id} value={building.id}>
                      {building.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-floor">{t("routeBuilderPickFloor")}</Label>
                <NativeSelect
                  id="template-floor"
                  value={floorId}
                  onChange={(event) => {
                    setFloorId(event.target.value);
                    setServicePointId("");
                  }}
                >
                  <NativeSelectOption value="" />
                  {floors?.map((floor) => (
                    <NativeSelectOption key={floor.id} value={floor.id}>
                      {floor.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <span aria-hidden="true" className="block text-sm leading-none font-medium">
                    {t("routeBuilderPointLabel")}
                  </span>
                  <NativeSelect
                    aria-label={t("routeBuilderAddPoint")}
                    value={servicePointId}
                    onChange={(event) => {
                      setServicePointId(event.target.value);
                    }}
                  >
                    <NativeSelectOption value="" />
                    {servicePoints?.map((point) => (
                      <NativeSelectOption key={point.id} value={point.id}>
                        {point.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
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
          </div>
        </div>
      </div>

      <div className="flex justify-end border-t px-4 py-3">
        <Button type="submit" disabled={weekdayMissing || create.isPending}>
          {t("routeTemplateSave")}
        </Button>
      </div>
    </form>
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
    <Page width="wide">
      <PageHeader title={t("routeTemplatePageTitle")} />

      {templates?.length === 0 && <EmptyState>{t("registryListEmpty")}</EmptyState>}
      {templates !== undefined && templates.length > 0 && (
        <ul className="bg-card divide-y rounded-md border">
          {templates.map((template) => (
            <TemplateRow key={template.id} client={client} template={template} />
          ))}
        </ul>
      )}

      <TemplateCreateForm client={client} />
    </Page>
  );
}
