import L from "leaflet";
import { describe, expect, it } from "vitest";

import { LEAFLET_POPUP_OFFSET_Y, popupOffset } from "@/components/map/popupOffset";

describe("popupOffset", () => {
  it("matches Leaflet's own default offset when nothing rises above the anchor", () => {
    expect(L.point(L.Popup.prototype.options.offset ?? [0, 0]).y).toBe(LEAFLET_POPUP_OFFSET_Y);
    expect(popupOffset(0)).toEqual(L.point(0, 7));
  });

  it("lifts the popup above a pin's body by the pin's height", () => {
    expect(popupOffset(36)).toEqual(L.point(0, -29));
  });
});
