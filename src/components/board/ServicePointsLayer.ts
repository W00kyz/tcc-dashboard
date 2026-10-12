import L from "leaflet";

import type { PointVisitStatus } from "@/lib/buildingInterior";

export interface MapServicePoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: PointVisitStatus;
}

// Leaflet paints from hexes, not CSS tokens: these mirror DESIGN.md's status colours.
const STATUS_FILL: Record<PointVisitStatus, string> = {
  DONE: "#23683f",
  IN_PROGRESS: "#8a5a00",
  LATE: "#b3261e",
  PENDING: "#6b7079",
  NOT_SCHEDULED: "#ffffff",
};

function pointIcon(status: PointVisitStatus): L.DivIcon {
  const style = `display:block;width:14px;height:14px;box-sizing:border-box;border:2px solid #ffffff;border-radius:2px;background:${STATUS_FILL[status]};${
    status === "NOT_SCHEDULED" ? "border-color:#6b7079;" : ""
  }`;

  return L.divIcon({ className: "", html: `<span style="${style}"></span>`, iconSize: [14, 14] });
}

/** Redraws the service points of the open building as small status-coloured squares. */
export function drawServicePoints(
  layer: L.LayerGroup,
  points: MapServicePoint[],
  selectedId: string | null,
  onSelect: (id: string) => void,
): void {
  layer.clearLayers();
  for (const point of points) {
    L.marker([point.latitude, point.longitude], { icon: pointIcon(point.status) })
      .bindTooltip(point.name, { permanent: point.id === selectedId, direction: "top" })
      .on("click", () => {
        onSelect(point.id);
      })
      .addTo(layer);
  }
}
