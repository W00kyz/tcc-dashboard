import type { GeoPolygon } from "@/lib/osmBuildings";

/** One corner of a building outline, GeoJSON order: [longitude, latitude]. */
export type OutlineCorner = [number, number];

/** The outline of a rectangle dragged from one corner to the opposite one, or null when the drag
 * has no area (a click, or a line). Corners run west-north, east-north, east-south, west-south,
 * and the ring is closed (first corner repeated), as the backend requires.
 * @example rectangleOutline([lonStart, latStart], [lonEnd, latEnd]) */
export function rectangleOutline(
  [lonA, latA]: OutlineCorner,
  [lonB, latB]: OutlineCorner,
): GeoPolygon | null {
  const [west, east] = [Math.min(lonA, lonB), Math.max(lonA, lonB)];
  const [south, north] = [Math.min(latA, latB), Math.max(latA, latB)];
  if (west === east || south === north) {
    return null;
  }
  const corners: OutlineCorner[] = [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];

  return { type: "Polygon", coordinates: [[...corners, [west, north]]] };
}
