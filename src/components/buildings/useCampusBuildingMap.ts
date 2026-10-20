import { useMemo } from "react";

import type { components } from "@/api/generated/schema";
import { type MapBuilding, mapBuildingsFrom } from "@/components/board/BuildingsLayer";
import {
  useAllFloors,
  useAllPoints,
  useBuildings,
} from "@/components/buildings/useBuildingRecords";
import { useTranslation } from "@/i18n/useTranslation";

type BuildingOut = components["schemas"]["BuildingOut"];
type FloorOut = components["schemas"]["FloorOut"];
type ServicePointOut = components["schemas"]["ServicePointOut"];
type Translate = ReturnType<typeof useTranslation>["t"];

const NO_BUILDINGS: BuildingOut[] = [];
const NO_FLOORS: FloorOut[] = [];
const NO_POINTS: ServicePointOut[] = [];

export interface BuildingCounts {
  floors: number;
  points: number;
}

function countBy<T>(items: T[], keyOf: (item: T) => string | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    if (key !== undefined) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

/** "2 andares · 1 ponto" — the line under a building's name.
 * @example countsLine(t, { floors: 2, points: 1 }) */
export function countsLine(t: Translate, { floors, points }: BuildingCounts): string {
  const floorText =
    floors === 1 ? t("buildingsFloorsOne") : t("buildingsFloors").replace("{n}", String(floors));
  const pointText =
    points === 1 ? t("buildingsPointsOne") : t("buildingsPoints").replace("{n}", String(points));

  return `${floorText} · ${pointText}`;
}

// Same campus-wide lists (and query keys) the Quadro de rotas reads.
function useCampusLists() {
  const buildings = useBuildings();
  const floors = useAllFloors();
  const points = useAllPoints();

  return {
    buildings: buildings.data ?? NO_BUILDINGS,
    floors: floors.data ?? NO_FLOORS,
    points: points.data ?? NO_POINTS,
  };
}

const NO_COUNTS: BuildingCounts = { floors: 0, points: 0 };

/** Every building ready for the campus map, how many floors and points each has, and the ones
 * with no outline (legacy) that must be reached another way.
 * @example const { mapBuildings, offMap, countsOf } = useCampusBuildingMap(); */
export function useCampusBuildingMap() {
  const { buildings, floors, points } = useCampusLists();

  return useMemo(() => {
    const buildingOfFloor = new Map(floors.map((floor) => [floor.id, floor.building_id]));
    const floorCounts = countBy(floors, (floor) => floor.building_id);
    const pointCounts = countBy(points, (point) => buildingOfFloor.get(point.floor_id));
    const mapBuildings: MapBuilding[] = mapBuildingsFrom(buildings);
    const drawn = new Set(mapBuildings.map((building) => building.id));

    return {
      buildings,
      mapBuildings,
      offMap: buildings.filter((building) => !drawn.has(building.id)),
      countsOf: (buildingId: string): BuildingCounts =>
        floorCounts.has(buildingId) || pointCounts.has(buildingId)
          ? {
              floors: floorCounts.get(buildingId) ?? 0,
              points: pointCounts.get(buildingId) ?? 0,
            }
          : NO_COUNTS,
    };
  }, [buildings, floors, points]);
}
