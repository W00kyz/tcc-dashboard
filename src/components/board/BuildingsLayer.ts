import L from "leaflet";

import type { components } from "@/api/generated/schema";
import { convexHull } from "@/lib/buildingInterior";
import type { GeoPolygon } from "@/lib/osmBuildings";

type BuildingOut = components["schemas"]["BuildingOut"];
type LonLat = [number, number];

/** A building ready to draw; `outline` is a closed ring in [lon, lat]. */
export interface MapBuilding {
  id: string;
  name: string;
  outline: LonLat[];
  approximate: boolean;
}

// The API types `footprint` as a free-form object, so the shape is checked before it is drawn.
function isGeoPolygon(value: unknown): value is GeoPolygon {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { type, coordinates } = value as { type?: unknown; coordinates?: unknown };

  return type === "Polygon" && Array.isArray(coordinates) && Array.isArray(coordinates[0]);
}

function toMapBuilding(building: BuildingOut, points: LonLat[]): MapBuilding | null {
  const { id, name, footprint } = building;
  const ring = isGeoPolygon(footprint) ? footprint.coordinates[0] : undefined;
  if (ring !== undefined) {
    return { id, name, outline: ring, approximate: false };
  }
  const hull = convexHull(points);

  return hull === null ? null : { id, name, outline: hull, approximate: true };
}

/** OSM footprint when the building has one, else the hull of its points (drawn dashed as
 * approximate), else omitted: with under 3 points there is no area to show. */
export function mapBuildingsFrom(
  buildings: BuildingOut[],
  pointsByBuilding: Map<string, LonLat[]>,
): MapBuilding[] {
  return buildings.flatMap((building) => {
    const mapped = toMapBuilding(building, pointsByBuilding.get(building.id) ?? []);

    return mapped === null ? [] : [mapped];
  });
}

const BUILDING_COLOR = "#14213d";

function styleFor(selected: boolean, anySelected: boolean, approximate: boolean): L.PathOptions {
  const dashArray = approximate ? "4 4" : undefined;
  const base = { color: BUILDING_COLOR, fillColor: BUILDING_COLOR, dashArray };
  if (selected) {
    return { ...base, weight: 3, fillOpacity: 0.3 };
  }

  return anySelected
    ? { color: "#6b7079", dashArray, weight: 1, fillOpacity: 0.05 }
    : { ...base, weight: 1.5, fillOpacity: 0.12 };
}

function drawBuilding(
  layer: L.LayerGroup,
  building: MapBuilding,
  selectedId: string | null,
  onSelect: (id: string) => void,
): L.Polygon {
  const selected = building.id === selectedId;
  const latLngs = building.outline.map(([lon, lat]): [number, number] => [lat, lon]);

  return L.polygon(latLngs, styleFor(selected, selectedId !== null, building.approximate))
    .bindTooltip(building.name, { permanent: selected, direction: "center" })
    .on("click", (event: L.LeafletMouseEvent) => {
      // Without this the click also reaches the map and would clear the selection at once.
      L.DomEvent.stopPropagation(event);
      onSelect(building.id);
    })
    .addTo(layer);
}

/** Redraws the building outlines; returns each polygon by id so the caller can zoom to one. */
export function drawBuildings(
  layer: L.LayerGroup,
  buildings: MapBuilding[],
  selectedId: string | null,
  onSelect: (id: string) => void,
): Map<string, L.Polygon> {
  layer.clearLayers();

  return new Map(
    buildings.map((building) => [building.id, drawBuilding(layer, building, selectedId, onSelect)]),
  );
}
