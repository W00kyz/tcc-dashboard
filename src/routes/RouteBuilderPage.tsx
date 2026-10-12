import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { SortableStopList, type StopDraft } from "@/components/SortableStopList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { toLocalIsoDate } from "@/lib/dates";
import { Page, PageHeader } from "@/components/layout/Page";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ChevronLeft } from "lucide-react";

type RouteType = "REGULAR" | "OCCASIONAL";
type StopBody = components["schemas"]["StopBody"];

// The backend's expected_arrival_* columns are tz-aware (`DateTime(timezone=True)`) and the
// backend normalises every arrival window to UTC (see routing/service.py `_combine_date_time`).
// The builder only collects a wall-clock "HH:MM", so we glue the route's date in front and
// tag it `Z` to send an explicit UTC instant that matches that convention. Empty time means
// "no window" — send null.
function combineDateTime(date: string, hhmm: string): string | null {
  return hhmm === "" ? null : `${date}T${hhmm}:00Z`;
}

// Round-trips a stored ISO instant back to the "HH:MM" the <input type="time"> shows. Parses
// through Date rather than slicing a fixed offset so a `Z`, a `+00:00` or a bare datetime all
// land on the same UTC wall-clock the builder sent.
function extractTime(iso: string | null): string {
  if (iso === null) {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const hours = String(parsed.getUTCHours()).padStart(2, "0");
  const minutes = String(parsed.getUTCMinutes()).padStart(2, "0");

  return `${hours}:${minutes}`;
}

export function RouteBuilderPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { routeId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const isEdit = routeId !== undefined;
  const routeType: RouteType = searchParams.get("type") === "OCCASIONAL" ? "OCCASIONAL" : "REGULAR";
  // Occasional routes are create-only (RF23 / spec §3.5): editing an existing route always
  // stays REGULAR, single-worker. Only the /rotas/nova?type=OCCASIONAL entry point branches.
  const isOccasional = !isEdit && routeType === "OCCASIONAL";

  const [fieldWorkerId, setFieldWorkerId] = useState("");
  const [fieldWorkerIds, setFieldWorkerIds] = useState<string[]>([]);
  const [routeDate, setRouteDate] = useState(toLocalIsoDate());
  const [buildingId, setBuildingId] = useState("");
  const [floorId, setFloorId] = useState("");
  const [servicePointId, setServicePointId] = useState("");
  const [stops, setStops] = useState<StopDraft[]>([]);
  const hydratedRef = useRef(false);

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
  const routeQuery = useQuery({
    queryKey: ["route", routeId],
    queryFn: async () => {
      // openapi-fetch never rejects on a 4xx/5xx, so an undeclared error would otherwise
      // hydrate an empty form. Surface it as a query error instead.
      const { data, response } = await client.GET("/routes/{route_id}", {
        params: { path: { route_id: routeId ?? "" } },
      });
      if (!response.ok) {
        throw new Error(
          `GET /routes/${routeId ?? ""} failed with status ${String(response.status)}`,
        );
      }

      return data ?? null;
    },
    enabled: isEdit,
  });
  const route = routeQuery.data;

  // Hydrate the drafts from the server exactly once; a later refetch must not stomp on
  // edits the manager has already made on screen.
  useEffect(() => {
    if (route === undefined || route === null || hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;
    setFieldWorkerId(route.field_worker_id);
    setRouteDate(route.route_date);
    setStops(
      route.stops.map((stop) => ({
        key: crypto.randomUUID(),
        servicePointId: stop.service_point_id,
        servicePointName: stop.service_point_name,
        expectedArrivalFrom: extractTime(stop.expected_arrival_from),
        expectedArrivalTo: extractTime(stop.expected_arrival_to),
        serviceTypeId: stop.service_type_id ?? "",
      })),
    );
  }, [route]);

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
        serviceTypeId: "",
      },
    ]);
    setServicePointId("");
  }

  function toggleWorker(id: string, checked: boolean) {
    setFieldWorkerIds((current) =>
      checked ? [...current, id] : current.filter((workerId) => workerId !== id),
    );
  }

  function editWindow(key: string, field: "from" | "to", value: string) {
    const property = field === "from" ? "expectedArrivalFrom" : "expectedArrivalTo";
    setStops((current) =>
      current.map((stop) => (stop.key === key ? { ...stop, [property]: value } : stop)),
    );
  }

  function editServiceType(key: string, serviceTypeId: string) {
    setStops((current) =>
      current.map((stop) => (stop.key === key ? { ...stop, serviceTypeId } : stop)),
    );
  }

  const save = useMutation({
    mutationFn: async () => {
      const stopBodies: StopBody[] = stops.map((stop) => ({
        service_point_id: stop.servicePointId,
        expected_arrival_from: combineDateTime(routeDate, stop.expectedArrivalFrom),
        expected_arrival_to: combineDateTime(routeDate, stop.expectedArrivalTo),
        // Omit rather than send `null` for a blank pick: existing routes with no service type
        // never sent this key, and the backend treats "absent" and "null" the same way.
        ...(stop.serviceTypeId === "" ? {} : { service_type_id: stop.serviceTypeId }),
      }));

      if (routeId !== undefined) {
        const { response } = await client.PATCH("/routes/{route_id}", {
          params: { path: { route_id: routeId } },
          // No `field_worker_id`: the backend 409s a PATCH that changes the assigned worker
          // (reassignment must go through the board's reassign dialog, with a reason). The
          // edit form's worker <select> is disabled, so it could only ever resend the same id.
          body: { route_date: routeDate, stops: stopBodies },
        });
        if (!response.ok) {
          throw new Error(`PATCH /routes/${routeId} failed with status ${String(response.status)}`);
        }

        return null;
      }

      if (isOccasional) {
        const { response } = await client.POST("/routes/occasional", {
          body: {
            field_worker_ids: fieldWorkerIds,
            route_date: routeDate,
            stops: stopBodies,
          },
        });
        if (!response.ok) {
          throw new Error(`POST /routes/occasional failed with status ${String(response.status)}`);
        }

        return null;
      }

      const { data, response } = await client.POST("/routes", {
        body: {
          field_worker_id: fieldWorkerId,
          route_date: routeDate,
          route_type: routeType,
          stops: stopBodies,
        },
      });
      if (!response.ok) {
        throw new Error(`POST /routes failed with status ${String(response.status)}`);
      }

      return data ?? null;
    },
    onSuccess: (created) => {
      if (isOccasional) {
        // Keep the route's own date in the redirect — the board defaults to today, which
        // would hide an occasional route created for any other day.
        void navigate(`/rotas?date=${routeDate}&route_type=OCCASIONAL`);

        return;
      }
      if (created !== null) {
        void navigate(`/rotas/${created.id}/editar`);
      }
    },
  });

  const submitDisabled = isOccasional && (fieldWorkerIds.length === 0 || stops.length === 0);

  if (isEdit && routeQuery.isError) {
    return (
      <Page>
        <PageHeader title={t("routeBuilderTitleEdit")} />
        <ErrorMessage>{t("routeBuilderLoadError")}</ErrorMessage>
      </Page>
    );
  }

  return (
    <Page width="wide">
      <Button variant="ghost" size="sm" className="-ml-2 self-start" asChild>
        <Link to="/rotas">
          <ChevronLeft aria-hidden="true" />
          {t("navRouteBoard")}
        </Link>
      </Button>
      <PageHeader
        title={
          isEdit
            ? t("routeBuilderTitleEdit")
            : isOccasional
              ? t("routeBuilderOccasionalTitle")
              : t("routeBuilderTitleNew")
        }
        description={isOccasional ? t("routeBuilderOccasionalHint") : undefined}
      />

      {save.isError && <ErrorMessage>{t("routeBuilderSaveError")}</ErrorMessage>}

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          // The disabled attribute stops a click, but pressing Enter from another field can
          // still fire submit — guard the occasional path against an empty worker/stop list.
          if (submitDisabled) {
            return;
          }
          save.mutate();
        }}
      >
        <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <section
            aria-labelledby="route-details-heading"
            className="bg-card space-y-4 rounded-md border p-4"
          >
            <h2 id="route-details-heading" className="text-primary text-base font-bold">
              {t("routeBuilderDetailsHeading")}
            </h2>
            {isOccasional ? (
              <fieldset>
                <legend className="text-sm leading-none font-semibold">
                  {t("routeBuilderPickWorkers")}
                </legend>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {workers?.map((worker) => (
                    <Label key={worker.id} className="font-normal">
                      <input
                        type="checkbox"
                        checked={fieldWorkerIds.includes(worker.id)}
                        onChange={(event) => {
                          toggleWorker(worker.id, event.target.checked);
                        }}
                      />
                      {worker.full_name}
                    </Label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="route-worker">{t("routeBuilderWorker")}</Label>
                <NativeSelect
                  id="route-worker"
                  value={fieldWorkerId}
                  // Reassignment is a dedicated action (mandatory reason) on the board, not a
                  // side effect of editing — and the backend 409s a PATCH that changes the worker.
                  disabled={isEdit}
                  onChange={(event) => {
                    setFieldWorkerId(event.target.value);
                  }}
                >
                  <NativeSelectOption value="" />
                  {workers?.map((worker) => (
                    <NativeSelectOption key={worker.id} value={worker.id}>
                      {worker.full_name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {isEdit && (
                  <p className="text-muted-foreground text-sm">
                    {t("routeBuilderWorkerLockedHint")}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="route-date">{t("routeBuilderDate")}</Label>
              <Input
                id="route-date"
                type="date"
                value={routeDate}
                onChange={(event) => {
                  setRouteDate(event.target.value);
                }}
              />
            </div>
          </section>

          <section
            aria-labelledby="route-stops-heading"
            className="bg-card space-y-4 rounded-md border p-4"
          >
            <h2 id="route-stops-heading" className="text-primary text-base font-bold">
              {t("routeBuilderStopsHeading")}
            </h2>
            <div className="grid grid-cols-1 gap-3 border-b pb-4 sm:grid-cols-[1fr_1fr_1.4fr]">
              <div className="space-y-1.5">
                <Label htmlFor="route-building">{t("routeBuilderPickBuilding")}</Label>
                <NativeSelect
                  id="route-building"
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
                <Label htmlFor="route-floor">{t("routeBuilderPickFloor")}</Label>
                <NativeSelect
                  id="route-floor"
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
              serviceTypes={serviceTypes ?? []}
              onReorder={setStops}
              onRemove={(key) => {
                setStops((current) => current.filter((stop) => stop.key !== key));
              }}
              onEditWindow={editWindow}
              onEditServiceType={editServiceType}
            />
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" asChild>
            <Link to="/rotas">{t("routeActionCancel")}</Link>
          </Button>
          <Button type="submit" disabled={submitDisabled}>
            {t("routeBuilderSave")}
          </Button>
        </div>
      </form>
    </Page>
  );
}
