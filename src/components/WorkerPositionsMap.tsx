import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";

import type { components } from "@/api/generated/schema";
import { useTranslation } from "@/i18n/useTranslation";

type BoardPosition = components["schemas"]["BoardPosition"];

// Centre of the campus bounding box in infra/osm/bbox.env — the view when nobody has
// reported a position yet.
const CAMPUS_CENTER: L.LatLngTuple = [-7.215, -35.909];
const CAMPUS_ZOOM = 16;
const MAX_FIT_ZOOM = 18;
// Older than this, a fix is drawn grey: the worker may have moved on since.
const STALE_AFTER_SECONDS = 15 * 60;

// The panel is always online (it is the manager's desktop), so it uses the public OSM tiles;
// the offline PMTiles archive is the mobile app's concern (RF28).
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function drawPositions(layer: L.LayerGroup, positions: BoardPosition[]): L.LatLngBounds | null {
  layer.clearLayers();
  if (positions.length === 0) {
    return null;
  }
  for (const position of positions) {
    const stale = position.age_seconds > STALE_AFTER_SECONDS;
    L.circleMarker([position.latitude, position.longitude], {
      radius: 8,
      color: stale ? "#6b7280" : "#1b4332",
      fillColor: stale ? "#9ca3af" : "#40916c",
      fillOpacity: 0.9,
      weight: 2,
    })
      .bindTooltip(position.field_worker_name, { permanent: true, direction: "top" })
      .addTo(layer);
  }

  return L.latLngBounds(positions.map((position) => [position.latitude, position.longitude]));
}

/** RF42: the latest position each field worker reported, on a map. Leaflet is driven
 * imperatively from effects — the component owns one map for its lifetime and only redraws
 * the marker layer when the snapshot changes. */
export function WorkerPositionsMap({ positions }: { positions: BoardPosition[] }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }
    const map = L.map(containerRef.current).setView(CAMPUS_CENTER, CAMPUS_ZOOM);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current === null || markersRef.current === null) {
      return;
    }
    const bounds = drawPositions(markersRef.current, positions);
    if (bounds !== null) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: MAX_FIT_ZOOM });
    }
  }, [positions]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={t("workerPositionsMapLabel")}
      className="h-80 w-full rounded-md border"
    />
  );
}
