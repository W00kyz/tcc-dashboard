import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { RegistryLayout, RegistryList } from "@/components/layout/Registry";

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
    <Page>
      <PageHeader title={t("servicePointsPageTitle")} />
      <RegistryLayout
        list={
          <div className="space-y-3">
            <fieldset className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <legend className="sr-only">{t("servicePointsListFiltersLabel")}</legend>
              <div className="w-full space-y-1.5 sm:w-64">
                <Label htmlFor="point-floor-filter">{t("servicePointsFilterFloor")}</Label>
                <NativeSelect
                  id="point-floor-filter"
                  value={floorFilterId}
                  onChange={(event) => {
                    setFloorFilterId(event.target.value);
                  }}
                >
                  <NativeSelectOption value="">
                    {t("servicePointsFilterFloorAll")}
                  </NativeSelectOption>
                  {floors?.map((floor) => (
                    <NativeSelectOption key={floor.id} value={floor.id}>
                      {floor.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <Label className="text-sm font-normal">
                <input
                  className="accent-primary size-4"
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => {
                    setShowArchived(event.target.checked);
                  }}
                />
                {t("servicePointsShowArchived")}
              </Label>
            </fieldset>
            <RegistryList
              items={points}
              getKey={(point) => point.id}
              renderItem={(point) => (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block font-semibold">{point.name}</span>
                    <span className="text-muted-foreground text-sm">
                      {floorLabel(point.floor_id)}
                    </span>
                  </span>
                  {point.point_type === "OCCASIONAL" && (
                    <>
                      <Badge variant="plate">{t("servicePointsTypeOccasional")}</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          promote.mutate(point.id);
                        }}
                      >
                        {t("servicePointsPromote")}
                      </Button>
                    </>
                  )}
                </>
              )}
            />
          </div>
        }
        form={
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="point-floor">{t("servicePointsFieldFloor")}</Label>
              <NativeSelect
                id="point-floor"
                value={floorId}
                onChange={(event) => {
                  setFloorId(event.target.value);
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
            <div className="space-y-1.5">
              <Label htmlFor="point-name">{t("servicePointsFieldName")}</Label>
              <Input
                id="point-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="point-description">{t("servicePointsFieldDescription")}</Label>
              <Input
                id="point-description"
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="point-type">{t("servicePointsFieldType")}</Label>
              <NativeSelect
                id="point-type"
                value={pointType}
                onChange={(event) => {
                  setPointType(event.target.value as PointType);
                }}
              >
                <NativeSelectOption value="REGULAR">
                  {t("servicePointsTypeRegular")}
                </NativeSelectOption>
                <NativeSelectOption value="OCCASIONAL">
                  {t("servicePointsTypeOccasional")}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            {pointType === "OCCASIONAL" && (
              <div className="space-y-1.5">
                <Label htmlFor="point-event">{t("servicePointsFieldEvent")}</Label>
                <NativeSelect
                  id="point-event"
                  value={eventId}
                  onChange={(event) => {
                    setEventId(event.target.value);
                  }}
                >
                  <NativeSelectOption value="" />
                  {events?.map((event) => (
                    <NativeSelectOption key={event.id} value={event.id}>
                      {event.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            <Button type="submit" className="w-full">
              {t("servicePointsSubmitCreate")}
            </Button>
          </form>
        }
      />
    </Page>
  );
}
