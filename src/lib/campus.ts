/** UFCG, campus Campina Grande: the box every map of the dashboard is framed on and the area
 * the OSM building import searches (infra/osm/bbox.env is not in the repository, so the box
 * lives here). */
export const CAMPUS_BBOX = { south: -7.218, west: -35.913, north: -7.211, east: -35.9045 } as const;

export type CampusBox = typeof CAMPUS_BBOX;
