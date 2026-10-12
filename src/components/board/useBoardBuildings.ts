import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import type { BuildingPanelProps } from "@/components/board/BuildingPanel";
import { type MapBuilding, mapBuildingsFrom } from "@/components/board/BuildingsLayer";
import type { MapServicePoint } from "@/components/board/ServicePointsLayer";
import { useBuildingInterior } from "@/components/board/useBuildingInterior";
import { type PointVisitStatus, pointStatusesForToday } from "@/lib/buildingInterior";

type ApiClient = ReturnType<typeof createApiClient>;
type BuildingOut = components["schemas"]["BuildingOut"];
type FloorOut = components["schemas"]["FloorOut"];
type ServicePointOut = components["schemas"]["ServicePointOut"];
type RouteOut = components["schemas"]["RouteOut"];
type LonLat = [number, number];

const NO_BUILDINGS: BuildingOut[] = [];
const NO_FLOORS: FloorOut[] = [];
const NO_POINTS: ServicePointOut[] = [];

// The page's fake/real API may answer an unrelated shape; anything but a list counts as empty.
function listOrEmpty<T>(data: T[] | undefined): T[] {
  return Array.isArray(data) ? data : [];
}

async function fetchBuildings(client: ApiClient): Promise<BuildingOut[]> {
  const { data } = await client.GET("/buildings");

  return listOrEmpty(data);
}

async function fetchAllFloors(client: ApiClient): Promise<FloorOut[]> {
  const { data } = await client.GET("/floors");

  return listOrEmpty(data);
}

async function fetchAllPoints(client: ApiClient): Promise<ServicePointOut[]> {
  const { data } = await client.GET("/service-points", {
    params: { query: { include_archived: false } },
  });

  return listOrEmpty(data);
}

// The map needs every building's points to draw hulls for buildings without an OSM footprint.
function pointsByBuildingFrom(
  floors: FloorOut[],
  points: ServicePointOut[],
): Map<string, LonLat[]> {
  const buildingOfFloor = new Map(floors.map((floor) => [floor.id, floor.building_id]));
  const grouped = new Map<string, LonLat[]>();
  for (const point of points) {
    const buildingId = buildingOfFloor.get(point.floor_id);
    if (buildingId !== undefined) {
      grouped.set(buildingId, [
        ...(grouped.get(buildingId) ?? []),
        [point.longitude, point.latitude],
      ]);
    }
  }

  return grouped;
}

function toMapPoints(
  points: ServicePointOut[],
  statuses: Map<string, PointVisitStatus>,
): MapServicePoint[] {
  return points.map((point) => ({
    id: point.id,
    name: point.name,
    latitude: point.latitude,
    longitude: point.longitude,
    status: statuses.get(point.id) ?? "NOT_SCHEDULED",
  }));
}

interface BoardBuildingsInput {
  dayRoutes: RouteOut[];
  delayedRouteIds: Set<string>;
}

interface Selection {
  buildingId: string | null;
  floorId: string;
}

// Hulls need every building's points, so these three lists are fetched once for the whole campus.
function useCampusBuildings() {
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");
  const buildings = useQuery({ queryKey: ["buildings"], queryFn: () => fetchBuildings(client) });
  const floors = useQuery({ queryKey: ["floors", "all"], queryFn: () => fetchAllFloors(client) });
  const points = useQuery({
    queryKey: ["service-points", "all"],
    queryFn: () => fetchAllPoints(client),
  });
  const mapBuildings: MapBuilding[] = useMemo(
    () =>
      mapBuildingsFrom(
        buildings.data ?? NO_BUILDINGS,
        pointsByBuildingFrom(floors.data ?? NO_FLOORS, points.data ?? NO_POINTS),
      ),
    [buildings.data, floors.data, points.data],
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

function pointsOnFloor(interior: Interior, floorId: string): ServicePointOut[] {
  return [...interior.pointsByFloor]
    .filter(([id]) => floorId === "all" || id === floorId)
    .flatMap(([, floorPoints]) => floorPoints);
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

// What changes when a building is open: the side panel and the points drawn on the map.
function openBuildingView(
  building: BuildingOut | undefined,
  selection: BuildingSelection,
  interior: Interior,
  statuses: Map<string, PointVisitStatus>,
) {
  if (building === undefined) {
    return { panelProps: null, mapPoints: [] as MapServicePoint[] };
  }

  return {
    panelProps: buildPanelProps(building, selection, interior, statuses),
    mapPoints: toMapPoints(pointsOnFloor(interior, selection.floorId), statuses),
  };
}

/** Everything the board needs to show buildings: outlines for the map, the open building's panel
 * and its points on the map, plus the selection state behind both.
 * @example const { mapBuildings, panelProps } = useBoardBuildings({ dayRoutes, delayedRouteIds }); */
export function useBoardBuildings({ dayRoutes, delayedRouteIds }: BoardBuildingsInput) {
  const selection = useBuildingSelection();
  const { buildings, mapBuildings } = useCampusBuildings();
  const interior = useBuildingInterior(selection.buildingId);
  const statuses = useMemo(
    () => pointStatusesForToday(dayRoutes, delayedRouteIds),
    [dayRoutes, delayedRouteIds],
  );
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
