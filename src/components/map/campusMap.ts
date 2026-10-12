import L from "leaflet";

import { CAMPUS_BBOX } from "@/lib/campus";

// UFCG, campus Campina Grande. The whole-campus view is the floor: the manager can zoom in
// freely but never out past the campus, and panning stays inside it.
const CAMPUS_BOUNDS = L.latLngBounds(
  [CAMPUS_BBOX.south, CAMPUS_BBOX.west],
  [CAMPUS_BBOX.north, CAMPUS_BBOX.east],
);
const CAMPUS_PADDING = L.point(8, 8);
const CAMPUS_FIT: L.FitBoundsOptions = { padding: [CAMPUS_PADDING.x, CAMPUS_PADDING.y] };
// Panning stops at the campus edge (applied once the map has a real size; Leaflet cannot clamp
// a centre inside bounds in a 0×0 container).
const CAMPUS_PAN_LIMIT = CAMPUS_BOUNDS.pad(0.05);
const MAP_OPTIONS: L.MapOptions = {
  // The tile server's deepest level, declared up front: without it the map's ceiling is
  // Infinity until the tile layer is added, and fitting bounds in a not-yet-sized container
  // lands on that infinite zoom (NaN centre).
  maxZoom: 19,
  // 1 = solid edges: dragging past the campus does not rubber-band out of it.
  maxBoundsViscosity: 1,
  // Fractional zoom so the campus fills the panel instead of snapping to the next whole level
  // out (which left it a small patch in the middle of the city).
  zoomSnap: 0.25,
};

// The panel is always online (it is the manager's desktop), so it uses the public OSM tiles;
// the offline PMTiles archive is the mobile app's concern (RF28).
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export interface CampusMapHandle {
  map: L.Map;
  dispose: () => void;
}

// The zoom that fits the whole campus becomes the minimum. Leaflet measures its container
// once, so this is redone whenever the layout reflows (sidebar toggle, phone rotation, the
// panel reaching its final height).
function lockMinimumZoomToCampus(map: L.Map): void {
  map.invalidateSize();
  // Nothing to measure yet (hidden panel, first paint, tests without layout).
  const size = map.getSize();
  if (size.x === 0 || size.y === 0) {
    return;
  }
  map.setMinZoom(map.getBoundsZoom(CAMPUS_BOUNDS, false, CAMPUS_PADDING));
  map.setMaxBounds(CAMPUS_PAN_LIMIT);
  if (map.getZoom() < map.getMinZoom()) {
    map.fitBounds(CAMPUS_BOUNDS, CAMPUS_FIT);
  }
}

/** A Leaflet map framed on the campus with OSM tiles, zoom floor and pan limit applied.
 * @example const { map, dispose } = createCampusMap(div); // later: dispose() */
export function createCampusMap(container: HTMLElement): CampusMapHandle {
  const map = L.map(container, MAP_OPTIONS).fitBounds(CAMPUS_BOUNDS, CAMPUS_FIT);
  const relock = () => {
    lockMinimumZoomToCampus(map);
  };
  relock();
  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(relock);
  resizeObserver?.observe(container);

  return {
    map,
    dispose: () => {
      resizeObserver?.disconnect();
      map.remove();
    },
  };
}
