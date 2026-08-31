import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

type PointType = "REGULAR" | "OCCASIONAL";

interface ServicePointRow {
  id: string;
  floor_id: string;
  name: string;
  description: string;
  latitude: number;
  longitude: number;
  point_type: PointType;
  event_id: string | null;
}
interface FloorRow {
  id: string;
  building_id: string;
  label: string;
}
interface EventRow {
  id: string;
  name: string;
  valid_from: string;
  valid_until: string;
}

export function ServicePointsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors RouteBoardPage/UsersPage/FieldWorkersPage/FloorsPage's convention: fall back to an
  // empty token instead of asserting a non-null session, so the page renders (and its requests
  // fail cleanly) even before the session has hydrated from storage.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");
  const [showArchived, setShowArchived] = useState(false);
  // Finding I4: the design spec calls for this screen to have "filtro por andar" alongside
  // the archived toggle — the backend already supports and tests ?floor_id=, this page just
  // never sent it. "" means no filter (every floor), matching the create-form's floor picker's
  // own empty-option convention.
  const [floorFilterId, setFloorFilterId] = useState("");

  const { data: points } = useQuery({
    queryKey: ["service-points", showArchived, floorFilterId],
    queryFn: async () => {
      const { data } = await client.GET("/service-points", {
        params: {
          query: {
            include_archived: showArchived,
            floor_id: floorFilterId === "" ? undefined : floorFilterId,
          },
        },
      });

      return data as ServicePointRow[];
    },
  });
  const { data: floors } = useQuery({
    queryKey: ["floors"],
    queryFn: async () => {
      const { data } = await client.GET("/floors");

      return data as FloorRow[];
    },
  });
  const { data: events } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data } = await client.GET("/events");

      return data as EventRow[];
    },
  });

  const [floorId, setFloorId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  const [pointType, setPointType] = useState<PointType>("REGULAR");
  const [eventId, setEventId] = useState("");

  function resetForm() {
    setFloorId("");
    setName("");
    setDescription("");
    setLatitude(0);
    setLongitude(0);
    setPointType("REGULAR");
    setEventId("");
  }

  const create = useMutation({
    mutationFn: async () => {
      await client.POST("/service-points", {
        body: {
          floor_id: floorId,
          name,
          description,
          latitude,
          longitude,
          point_type: pointType,
          // Only an OCCASIONAL point ties to an event, and only when one was actually picked —
          // otherwise an empty string would go over the wire instead of the null the schema
          // (ServicePointCreateRequest.event_id) expects for "no event".
          event_id: pointType === "OCCASIONAL" && eventId !== "" ? eventId : null,
        },
      });
    },
    // Reset every field the form owns, not just name/description (Task 14's Events page bug
    // pattern) — leaving pointType/eventId behind would keep the event picker open (or hidden
    // in a stale state) after a successful submit.
    onSuccess: () => {
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ["service-points"] });
    },
  });

  const promote = useMutation({
    mutationFn: async (pointId: string) => {
      await client.POST("/service-points/{point_id}/promote", {
        params: { path: { point_id: pointId } },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["service-points"] });
    },
  });

  function floorLabel(id: string): string {
    return floors?.find((floor) => floor.id === id)?.label ?? id;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("servicePointsPageTitle")}</h1>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <Label htmlFor="point-floor">{t("servicePointsFieldFloor")}</Label>
          <select
            id="point-floor"
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={floorId}
            onChange={(event) => {
              setFloorId(event.target.value);
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
        <div>
          <Label htmlFor="point-name">{t("servicePointsFieldName")}</Label>
          <Input
            id="point-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="point-description">{t("servicePointsFieldDescription")}</Label>
          <Input
            id="point-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="point-latitude">{t("servicePointsFieldLatitude")}</Label>
          <Input
            id="point-latitude"
            type="number"
            step="any"
            value={latitude}
            onChange={(event) => {
              setLatitude(Number(event.target.value));
            }}
          />
        </div>
        <div>
          <Label htmlFor="point-longitude">{t("servicePointsFieldLongitude")}</Label>
          <Input
            id="point-longitude"
            type="number"
            step="any"
            value={longitude}
            onChange={(event) => {
              setLongitude(Number(event.target.value));
            }}
          />
        </div>
        <div>
          <Label htmlFor="point-type">{t("servicePointsFieldType")}</Label>
          <select
            id="point-type"
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={pointType}
            onChange={(event) => {
              setPointType(event.target.value as PointType);
            }}
          >
            <option value="REGULAR">{t("servicePointsTypeRegular")}</option>
            <option value="OCCASIONAL">{t("servicePointsTypeOccasional")}</option>
          </select>
        </div>
        {pointType === "OCCASIONAL" && (
          <div>
            <Label htmlFor="point-event">{t("servicePointsFieldEvent")}</Label>
            <select
              id="point-event"
              className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              value={eventId}
              onChange={(event) => {
                setEventId(event.target.value);
              }}
            >
              <option value="" />
              {events?.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit">{t("servicePointsSubmitCreate")}</Button>
      </form>

      <div>
        <Label htmlFor="point-floor-filter">{t("servicePointsFilterFloor")}</Label>
        <select
          id="point-floor-filter"
          className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          value={floorFilterId}
          onChange={(event) => {
            setFloorFilterId(event.target.value);
          }}
        >
          <option value="">{t("servicePointsFilterFloorAll")}</option>
          {floors?.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.label}
            </option>
          ))}
        </select>
      </div>

      <Label className="text-sm">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => {
            setShowArchived(event.target.checked);
          }}
        />
        {t("servicePointsShowArchived")}
      </Label>

      <ul className="divide-border divide-y">
        {points?.map((point) => (
          <li key={point.id} className="flex items-center justify-between py-2">
            <span>
              <span className="font-medium">{point.name}</span>{" "}
              <span className="text-muted-foreground">{floorLabel(point.floor_id)}</span>
            </span>
            {point.point_type === "OCCASIONAL" && (
              <Button
                variant="outline"
                onClick={() => {
                  promote.mutate(point.id);
                }}
              >
                {t("servicePointsPromote")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
