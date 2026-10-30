import L from "leaflet";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startPlacePinTool } from "@/components/map/placePinTool";

function makeMap(): L.Map {
  const container = document.createElement("div");
  document.body.append(container);

  return L.map(container).setView([-7.215, -35.909], 17);
}

const click = (map: L.Map, latlng: L.LatLng) => {
  map.fire("click", { latlng });
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("startPlacePinTool", () => {
  it("shows the crosshair while it is on", () => {
    const map = makeMap();

    startPlacePinTool(map, vi.fn());

    expect(map.getContainer().classList.contains("map-placing")).toBe(true);
  });

  it("places once at the clicked point and then turns itself off", () => {
    const map = makeMap();
    const onPlaced = vi.fn();
    startPlacePinTool(map, onPlaced);
    const point = L.latLng(-7.216, -35.908);

    click(map, point);
    click(map, L.latLng(-7.217, -35.907));

    expect(onPlaced).toHaveBeenCalledOnce();
    expect(onPlaced).toHaveBeenCalledWith(point);
    expect(map.getContainer().classList.contains("map-placing")).toBe(false);
  });

  it("restores the cursor and stops listening when cleaned up", () => {
    const map = makeMap();
    const onPlaced = vi.fn();
    const stop = startPlacePinTool(map, onPlaced);

    stop();
    click(map, L.latLng(-7.216, -35.908));

    expect(onPlaced).not.toHaveBeenCalled();
    expect(map.getContainer().classList.contains("map-placing")).toBe(false);
  });

  it("exits on Escape", () => {
    const map = makeMap();
    const onPlaced = vi.fn();
    const onExit = vi.fn();
    startPlacePinTool(map, onPlaced, onExit);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onExit).toHaveBeenCalledOnce();
    expect(onPlaced).not.toHaveBeenCalled();
  });

  it("ignores Escape after cleanup", () => {
    const map = makeMap();
    const onExit = vi.fn();
    const stop = startPlacePinTool(map, vi.fn(), onExit);

    stop();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(onExit).not.toHaveBeenCalled();
  });
});
