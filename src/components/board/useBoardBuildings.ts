import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import type { BuildingPanelProps } from "@/components/board/BuildingPanel";
import { type MapBuilding, mapBuildingsFrom } from "@/components/board/BuildingsLayer";
import { useBuildingInterior } from "@/components/board/useBuildingInterior";
import { type PointVisitStatus, pointStatusesForToday } from "@/lib/buildingInterior";

type ApiClient = ReturnType<typeof createApiClient>;
type BuildingOut = components["schemas"]["BuildingOut"];
type RouteOut = components["schemas"]["RouteOut"];

const NO_BUILDINGS: BuildingOut[] = [];

// The page's fake/real API may answer an unrelated shape; anything but a list counts as empty.
// A failed response throws instead: an expired token's 401 read as "no buildings" emptied the
// map until the next reload; failing lets React Query retry once the session has refreshed.
function listOrEmpty<T>(data: T[] | undefined, response: Response, request: string): T[] {
  if (!response.ok) {
    throw new Error(`${request} failed with status ${String(response.status)}; expected a list.`);
  }

  return Array.isArray(data) ? data : [];
}

async function fetchBuildings(client: ApiClient): Promise<BuildingOut[]> {
  const { data, response } = await client.GET("/buildings");

  return listOrEmpty(data, response, "GET /buildings");
}

interface BoardBuildingsInput {
  dayRoutes: RouteOut[];
}

interface Selection {
  buildingId: string | null;
  floorId: string;
}

function useCampusBuildings() {
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");
  const buildings = useQuery({ queryKey: ["buildings"], queryFn: () => fetchBuildings(client) });
  const mapBuildings: MapBuilding[] = useMemo(
    () => mapBuildingsFrom(buildings.data ?? NO_BUILDINGS),
    [buildings.data],
  );

  return { buildings: buildings.data ?? NO_BUILDINGS, mapBuildings };
}

type Interior = ReturnType<typeof useBuildingInterior>;
type BuildingSelection = ReturnType<typeof useBuildingSelection>;

function useBuildingSelection() {
  const [selection, setSelection] = useState<Selection>({ buildingId: null, floorId: "all" });
  const [selectedPointId, selectPoint] = useState<string | null>(null);
  // A new building starts on "all floors" with nothing highlighted.
  const selectBuilding = (buildingId: string | null) => {
    setSelection({ buildingId, floorId: "all" });
    selectPoint(null);
  };
  const selectFloor = (floorId: string) => {
    setSelection((current) => ({ ...current, floorId }));
  };
  const closeBuilding = () => {
    selectBuilding(null);
  };

  return { ...selection, selectedPointId, selectPoint, selectBuilding, selectFloor, closeBuilding };
}

function buildPanelProps(
  building: BuildingOut,
  selection: BuildingSelection,
  interior: Interior,
  statuses: Map<string, PointVisitStatus>,
): BuildingPanelProps {
  const { id, name, campus_area: campusArea } = building;

  return {
    building: { id, name, campusArea },
    ...interior,
    statuses,
    selectedFloorId: selection.floorId,
    onSelectFloor: selection.selectFloor,
    selectedPointId: selection.selectedPointId,
    onSelectPoint: selection.selectPoint,
    onClose: selection.closeBuilding,
  };
}

// What changes when a building is open: the side panel. Its points are not drawn on the map —
// they all sit at the building's centre (spec 2026-10-20 §3.3).
function openBuildingView(
  building: BuildingOut | undefined,
  selection: BuildingSelection,
  interior: Interior,
  statuses: Map<string, PointVisitStatus>,
) {
  return {
    panelProps:
      building === undefined ? null : buildPanelProps(building, selection, interior, statuses),
  };
}

/** Everything the board needs to show buildings: outlines for the map, the open building's panel
 * and the selection state behind both.
 * @example const { mapBuildings, panelProps } = useBoardBuildings({ dayRoutes }); */
export function useBoardBuildings({ dayRoutes }: BoardBuildingsInput) {
  const selection = useBuildingSelection();
  const { buildings, mapBuildings } = useCampusBuildings();
  const interior = useBuildingInterior(selection.buildingId);
  const statuses = useMemo(() => pointStatusesForToday(dayRoutes), [dayRoutes]);
  const open = buildings.find((building) => building.id === selection.buildingId);

  return {
    mapBuildings,
    selectBuilding: selection.selectBuilding,
    selectedBuildingId: open?.id ?? null,
    selectedPointId: selection.selectedPointId,
    selectPoint: selection.selectPoint,
    ...openBuildingView(open, selection, interior, statuses),
  };
}
