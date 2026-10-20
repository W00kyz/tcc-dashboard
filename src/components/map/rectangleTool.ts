import L from "leaflet";

import type { GeoPolygon } from "@/lib/osmBuildings";
import { type OutlineCorner, rectangleOutline } from "@/lib/outlineDraft";

// Leaflet paints SVG attributes, not CSS: navy of DESIGN.md, dashed while it is still a draft.
export const DRAFT_RECTANGLE_STYLE: L.PathOptions = {
  color: "#14213d",
  weight: 2,
  dashArray: "6 4",
  fillOpacity: 0.15,
};

interface RectangleToolHandlers {
  onDrawn: (outline: GeoPolygon) => void;
  /** Escape outside a drag: the manager gave up on drawing. */
  onExit: () => void;
}

const toCorner = ({ lat, lng }: L.LatLng): OutlineCorner => [lng, lat];

// Dragging the map and box-zoom both own the mouse drag; the tool needs it while it is active.
function lockMapGestures(map: L.Map): () => void {
  map.dragging.disable();
  map.boxZoom.disable();
  map.doubleClickZoom.disable();
  map.getContainer().classList.add("map-drawing");

  return () => {
    map.dragging.enable();
    map.boxZoom.enable();
    map.doubleClickZoom.enable();
    map.getContainer().classList.remove("map-drawing");
  };
}

/**
 * Turns a mouse drag on the map into a rectangle: press at one corner, release at the opposite
 * one. Returns the function that turns the tool off and gives the map its gestures back.
 * @example const stop = startRectangleTool(map, { onDrawn: setDraft, onExit: stopDrawing });
 */
export function startRectangleTool(map: L.Map, handlers: RectangleToolHandlers): () => void {
  const unlock = lockMapGestures(map);
  let start: L.LatLng | null = null;
  let preview: L.Rectangle | null = null;
  const clearPreview = () => {
    preview?.remove();
    preview = null;
    start = null;
  };
  const onDown = (event: L.LeafletMouseEvent) => {
    start = event.latlng;
    preview = L.rectangle(L.latLngBounds(start, start), DRAFT_RECTANGLE_STYLE).addTo(map);
  };
  const onMove = (event: L.LeafletMouseEvent) => {
    if (start !== null) {
      preview?.setBounds(L.latLngBounds(start, event.latlng));
    }
  };
  const onUp = (event: L.LeafletMouseEvent) => {
    const outline =
      start === null ? null : rectangleOutline(toCorner(start), toCorner(event.latlng));
    clearPreview();
    // A plain click has no area: keep the tool on and wait for a real drag.
    if (outline !== null) {
      handlers.onDrawn(outline);
    }
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") {
      return;
    }
    if (start === null) {
      handlers.onExit();
    }
    clearPreview();
  };
  map.on("mousedown", onDown).on("mousemove", onMove).on("mouseup", onUp);
  document.addEventListener("keydown", onKey);

  return () => {
    map.off("mousedown", onDown).off("mousemove", onMove).off("mouseup", onUp);
    document.removeEventListener("keydown", onKey);
    clearPreview();
    unlock();
  };
}
