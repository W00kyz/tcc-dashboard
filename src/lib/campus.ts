export interface CampusBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** UFCG, campus Campina Grande: the box a deployment that sets no `VITE_CAMPUS_BBOX` frames its
 * maps on (infra/osm/bbox.env is not in the repository, so the default lives here). */
const UFCG_BBOX: CampusBox = { south: -7.218, west: -35.913, north: -7.211, east: -35.9045 };

/** The campus box from a `"south,west,north,east"` string (degrees). Undefined, empty,
 * malformed, upside-down or off-the-globe input gives the UFCG box, so a typo in the
 * environment never leaves the maps framed on nothing.
 * @example campusBoxFrom("-7.26,-35.90,-7.25,-35.88").north // -7.25 */
export function campusBoxFrom(raw: string | undefined): CampusBox {
  const parts = (raw ?? "").split(",");
  if (parts.length !== 4 || parts.some((part) => part.trim() === "")) {
    return UFCG_BBOX;
  }
  const [south, west, north, east] = parts.map(Number);
  if (
    south === undefined ||
    west === undefined ||
    north === undefined ||
    east === undefined ||
    ![south, west, north, east].every(Number.isFinite) ||
    Math.abs(south) > 90 ||
    Math.abs(north) > 90 ||
    Math.abs(west) > 180 ||
    Math.abs(east) > 180 ||
    south >= north ||
    west >= east
  ) {
    return UFCG_BBOX;
  }

  return { south, west, north, east };
}

/** The box every map of the dashboard is framed on and the area the OSM building import
 * searches: `VITE_CAMPUS_BBOX` when the deployment sets it, the UFCG campus otherwise. */
export const CAMPUS_BBOX = campusBoxFrom(import.meta.env.VITE_CAMPUS_BBOX as string | undefined);
