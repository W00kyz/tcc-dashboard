import L from "leaflet";

// Leaflet's own default popup offset (Popup.js options.offset = [0, 7]): the gap that keeps the
// popup's tip clear of its anchor. Passing any offset replaces it, so it is kept here.
export const LEAFLET_POPUP_OFFSET_Y = 7;

/** The popup offset for an anchor whose visible shape rises `riseAbove` px above it (a pin's
 * body above its tip). With 0 it is exactly Leaflet's default.
 * @example popupOffset(0) // Point(0, 7) */
export function popupOffset(riseAbove: number): L.Point {
  return L.point(0, LEAFLET_POPUP_OFFSET_Y - riseAbove);
}
