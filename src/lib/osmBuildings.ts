import type { CampusBox } from "@/lib/campus";

export interface GeoPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

export interface OsmBuilding {
  osmWayId: number;
  name: string | null;
  footprint: GeoPolygon;
}

// Same limits the backend enforces (app/domain/catalog/footprint.py).
const MIN_POSITIONS = 4;
const MAX_POSITIONS = 500;

/** Overpass QL for every building way inside the box, with inline geometry.
 * @example buildOverpassQuery(CAMPUS_BBOX) */
export function buildOverpassQuery(box: CampusBox): string {
  const bbox = `${String(box.south)},${String(box.west)},${String(box.north)},${String(box.east)}`;

  return `[out:json][timeout:25];way["building"](${bbox});out geom;`;
}

interface OverpassNode {
  lat: number;
  lon: number;
}

function isNode(value: unknown): value is OverpassNode {
  const node = value as Partial<OverpassNode> | null;

  return typeof node?.lat === "number" && typeof node.lon === "number";
}

function toRing(geometry: unknown): [number, number][] | null {
  if (!Array.isArray(geometry) || !geometry.every(isNode)) {
    return null;
  }
  const ring = geometry.map((node): [number, number] => [node.lon, node.lat]);

  return isUsableRing(ring) ? ring : null;
}

// An open ring or one past the backend's limit would be rejected on save, so it is dropped here.
function isUsableRing(ring: [number, number][]): boolean {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length < MIN_POSITIONS || ring.length > MAX_POSITIONS) {
    return false;
  }
  if (first === undefined || last === undefined) {
    return false;
  }

  return first[0] === last[0] && first[1] === last[1];
}

function toBuilding(element: unknown): OsmBuilding | null {
  const way = element as {
    type?: unknown;
    id?: unknown;
    tags?: { name?: unknown };
    geometry?: unknown;
  };
  if (way.type !== "way" || typeof way.id !== "number") {
    return null;
  }
  const ring = toRing(way.geometry);
  if (ring === null) {
    return null;
  }
  const name = typeof way.tags?.name === "string" ? way.tags.name : null;

  return { osmWayId: way.id, name, footprint: { type: "Polygon", coordinates: [ring] } };
}

/** Building outlines from an Overpass `out geom` response; anything the map or the backend
 * could not use is dropped. @example parseOverpassBuildings(await response.json()) */
export function parseOverpassBuildings(response: unknown): OsmBuilding[] {
  const elements = (response as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) {
    return [];
  }

  return elements.map(toBuilding).filter((building): building is OsmBuilding => building !== null);
}
