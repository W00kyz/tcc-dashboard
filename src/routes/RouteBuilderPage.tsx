import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { SortableStopList, type StopDraft } from "@/components/SortableStopList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

type RouteType = "REGULAR" | "OCCASIONAL";
type StopBody = components["schemas"]["StopBody"];

const SELECT_CLASS = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm";

// Local calendar date, not `new Date().toISOString().slice(0, 10)` — that is the UTC day
// and rolls over early/late for a Brazil-time user near midnight.
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${String(now.getFullYear())}-${month}-${day}`;
}

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

  const [fieldWorkerId, setFieldWorkerId] = useState("");
  const [routeDate, setRouteDate] = useState(todayIso());
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
      },
    ]);
    setServicePointId("");
  }

  function editWindow(key: string, field: "from" | "to", value: string) {
    const property = field === "from" ? "expectedArrivalFrom" : "expectedArrivalTo";
    setStops((current) =>
      current.map((stop) => (stop.key === key ? { ...stop, [property]: value } : stop)),
    );
  }

  const save = useMutation({
    mutationFn: async () => {
      const stopBodies: StopBody[] = stops.map((stop) => ({
        service_point_id: stop.servicePointId,
        expected_arrival_from: combineDateTime(routeDate, stop.expectedArrivalFrom),
        expected_arrival_to: combineDateTime(routeDate, stop.expectedArrivalTo),
      }));

      if (routeId !== undefined) {
        const { response } = await client.PATCH("/routes/{route_id}", {
          params: { path: { route_id: routeId } },
          body: { field_worker_id: fieldWorkerId, route_date: routeDate, stops: stopBodies },
        });
        if (!response.ok) {
          throw new Error(`PATCH /routes/${routeId} failed with status ${String(response.status)}`);
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
      if (created !== null) {
        void navigate(`/rotas/${created.id}/editar`);
      }
    },
  });

  if (isEdit && routeQuery.isError) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <h1 className="text-xl font-semibold">{t("routeBuilderTitleEdit")}</h1>
        <p role="alert" className="text-destructive">
          {t("routeBuilderLoadError")}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">
        {isEdit ? t("routeBuilderTitleEdit") : t("routeBuilderTitleNew")}
      </h1>

      {save.isError && (
        <p role="alert" className="text-destructive">
          {t("routeBuilderSaveError")}
        </p>
      )}

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <Label htmlFor="route-worker">{t("routeBuilderWorker")}</Label>
          <select
            id="route-worker"
            className={SELECT_CLASS}
            value={fieldWorkerId}
            onChange={(event) => {
              setFieldWorkerId(event.target.value);
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

        <div>
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="route-building">{t("routeBuilderPickBuilding")}</Label>
            <select
              id="route-building"
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
            <Label htmlFor="route-floor">{t("routeBuilderPickFloor")}</Label>
            <select
              id="route-floor"
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

        <Button type="submit">{t("routeBuilderSave")}</Button>
      </form>
    </main>
  );
}
