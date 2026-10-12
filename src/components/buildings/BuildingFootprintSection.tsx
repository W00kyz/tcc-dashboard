import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { fetchCampusBuildings } from "@/api/overpass";
import type { components } from "@/api/generated/schema";
import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { FootprintPickerMap } from "@/components/buildings/FootprintPickerMap";
import { Section } from "@/components/layout/Page";
import { ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";
import type { GeoPolygon, OsmBuilding } from "@/lib/osmBuildings";

type BuildingOut = components["schemas"]["BuildingOut"];

interface BuildingFootprintSectionProps {
  buildingId: string;
  /** Seam for tests: the Overpass call is the only non-API network access on this page. */
  fetchOsm?: () => Promise<OsmBuilding[]>;
}

// The OpenAPI schema types the stored footprint as a free-form object; the backend validates
// it as a Polygon on write, so reading it back as one is safe.
function asPolygon(footprint: BuildingOut["footprint"]): GeoPolygon | null {
  return footprint ? (footprint as unknown as GeoPolygon) : null;
}

function otherBuildingsByWay(buildings: BuildingOut[], buildingId: string): Map<number, string> {
  const owners = new Map<number, string>();
  for (const building of buildings) {
    if (building.id !== buildingId && typeof building.osm_way_id === "number") {
      owners.set(building.osm_way_id, building.name);
    }
  }

  return owners;
}

type ApiClient = ReturnType<typeof createApiClient>;

// FastAPI answers `detail` as a string (HTTPException) or a list of `{ msg }` (validation); the
// manager should read a sentence, not the JSON body.
function failureReason(error: unknown, status: number): string {
  const detail = (error as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === "string") {
    return detail;
  }
  const first: unknown = Array.isArray(detail) ? detail[0] : undefined;
  const message = (first as { msg?: unknown } | undefined)?.msg;

  return typeof message === "string" ? message : String(status);
}

function assertOk(result: { response: Response; error?: unknown }): void {
  if (!result.response.ok) {
    throw new Error(failureReason(result.error, result.response.status));
  }
}

async function putFootprint(client: ApiClient, buildingId: string, candidate: OsmBuilding) {
  assertOk(
    await client.PUT("/buildings/{building_id}/footprint", {
      params: { path: { building_id: buildingId } },
      body: { footprint: candidate.footprint, osm_way_id: candidate.osmWayId },
    }),
  );
}

async function deleteFootprint(client: ApiClient, buildingId: string) {
  assertOk(
    await client.DELETE("/buildings/{building_id}/footprint", {
      params: { path: { building_id: buildingId } },
    }),
  );
}

function useFootprintMutations(buildingId: string, onSaved: () => void) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");
  const onSuccess = () => {
    onSaved();
    void queryClient.invalidateQueries({ queryKey: ["buildings"] });
  };
  const link = useMutation({
    mutationFn: (candidate: OsmBuilding) => putFootprint(client, buildingId, candidate),
    onSuccess,
  });
  const remove = useMutation({ mutationFn: () => deleteFootprint(client, buildingId), onSuccess });

  return { client, link, remove };
}

function useCampusBuildings(client: ApiClient, fetchOsm: () => Promise<OsmBuilding[]>) {
  const buildings = useQuery({
    queryKey: ["buildings"],
    queryFn: async () => (await client.GET("/buildings")).data ?? [],
  });
  const osm = useQuery({
    queryKey: ["osm-campus-buildings"],
    queryFn: fetchOsm,
    staleTime: Infinity,
    // Overpass is slow and rate-limited: keep the answer for the whole session, even after the
    // section unmounts.
    gcTime: Infinity,
  });

  return { buildings, osm };
}

interface FootprintHandlers {
  busy: boolean;
  onLink: (candidate: OsmBuilding) => void;
  onRemove: () => void;
}

function useFootprintHandlers(mutations: ReturnType<typeof useFootprintMutations>) {
  const { t } = useTranslation();
  const { link, remove } = mutations;
  const handlers: FootprintHandlers = {
    busy: link.isPending || remove.isPending,
    // Clearing the other mutation's error keeps a stale failure from lingering next to a
    // fresh attempt.
    onLink: (candidate) => {
      remove.reset();
      link.mutate(candidate);
    },
    // Destructive and not undoable from the UI: ask first.
    onRemove: () => {
      if (window.confirm(t("footprintRemoveConfirm"))) {
        link.reset();
        remove.mutate();
      }
    },
  };

  return { handlers, failure: link.error ?? remove.error };
}

// Everything the section renders, so the component itself stays a frame. `picker` feeds
// PickerAndActions; `failure` is the last link/remove error, if any.
function useFootprintSection(buildingId: string, fetchOsm: () => Promise<OsmBuilding[]>) {
  const [selectedWayId, setSelectedWayId] = useState<number | null>(null);
  const mutations = useFootprintMutations(buildingId, () => {
    setSelectedWayId(null);
  });
  const { buildings, osm } = useCampusBuildings(mutations.client, fetchOsm);
  const { handlers, failure } = useFootprintHandlers(mutations);
  const picker: PickerAndActionsProps = {
    candidates: osm.data ?? null,
    current: buildings.data?.find((building) => building.id === buildingId),
    owners: otherBuildingsByWay(buildings.data ?? [], buildingId),
    selectedWayId,
    selected: osm.data?.find((candidate) => candidate.osmWayId === selectedWayId) ?? null,
    onPick: setSelectedWayId,
    handlers,
  };

  return { osm, picker, failure };
}

/** Lets a manager bind an OpenStreetMap outline to the building (or unbind it), so the operations
 * map can draw the building. */
export function BuildingFootprintSection({
  buildingId,
  fetchOsm = () => fetchCampusBuildings(),
}: BuildingFootprintSectionProps) {
  const { t } = useTranslation();
  const { osm, picker, failure } = useFootprintSection(buildingId, fetchOsm);

  return (
    <Section title={t("footprintSectionTitle")}>
      {osm.isPending && <LoadingMessage>{t("footprintLoading")}</LoadingMessage>}
      {osm.isError && <OsmError onRetry={() => void osm.refetch()} />}
      <PickerAndActions {...picker} />
      {failure && (
        <ErrorMessage>{t("footprintSaveError").replace("{reason}", failure.message)}</ErrorMessage>
      )}
    </Section>
  );
}

interface PickerAndActionsProps {
  candidates: OsmBuilding[] | null;
  current: BuildingOut | undefined;
  owners: Map<number, string>;
  selectedWayId: number | null;
  selected: OsmBuilding | null;
  onPick: (wayId: number) => void;
  handlers: FootprintHandlers;
}

function PickerAndActions(props: PickerAndActionsProps) {
  const { candidates, current, selectedWayId, selected, handlers } = props;
  const hasLinked = Boolean(current?.footprint);

  return (
    <>
      {(candidates !== null || hasLinked) && (
        <FootprintPickerMap
          candidates={candidates ?? []}
          linked={asPolygon(current?.footprint)}
          selectedWayId={selectedWayId}
          linkedElsewhere={props.owners}
          onPick={props.onPick}
        />
      )}
      <FootprintActions selected={selected} hasLinked={hasLinked} handlers={handlers} />
    </>
  );
}

function OsmError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ErrorMessage>{t("footprintOsmError")}</ErrorMessage>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("footprintRetry")}
      </Button>
    </div>
  );
}

interface FootprintActionsProps {
  selected: OsmBuilding | null;
  hasLinked: boolean;
  handlers: FootprintHandlers;
}

function FootprintActions({ selected, hasLinked, handlers }: FootprintActionsProps) {
  const { t } = useTranslation();
  const { busy, onLink, onRemove } = handlers;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {selected === null ? (
        <p className="text-muted-foreground text-sm">{t("footprintPickHint")}</p>
      ) : (
        <PickedOutline selected={selected} replaces={hasLinked} busy={busy} onLink={onLink} />
      )}
      {hasLinked && (
        <Button variant="outline" size="sm" disabled={busy} onClick={onRemove}>
          {t("footprintRemove")}
        </Button>
      )}
    </div>
  );
}

interface PickedOutlineProps {
  selected: OsmBuilding;
  replaces: boolean;
  busy: boolean;
  onLink: (candidate: OsmBuilding) => void;
}

function PickedOutline({ selected, replaces, busy, onLink }: PickedOutlineProps) {
  const { t } = useTranslation();
  const name = selected.name ?? t("footprintUnnamed");

  return (
    <>
      <p className="text-sm">{t("footprintPicked").replace("{name}", name)}</p>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => {
          onLink(selected);
        }}
      >
        {t(replaces ? "footprintReplace" : "footprintLink")}
      </Button>
    </>
  );
}
