import L from "leaflet";
import { describe, expect, it, vi } from "vitest";

import { drawPlaces, type MapPlace, PIN_HEIGHT, PIN_WIDTH } from "@/components/board/PlacesLayer";

const PLACES: MapPlace[] = [
  { id: "p1", name: "Praça central", latitude: -7.215, longitude: -35.909 },
  { id: "p2", name: "Estacionamento", latitude: -7.22, longitude: -35.91 },
];

function markersOf(group: L.LayerGroup): L.Marker[] {
  return group.getLayers().filter((layer): layer is L.Marker => layer instanceof L.Marker);
}

function setup(selectedId: string | null = null, onSelect = vi.fn()) {
  const container = document.createElement("div");
  document.body.append(container);
  const map = L.map(container).setView([-7.215, -35.909], 17);
  const group = L.layerGroup().addTo(map);
  drawPlaces(group, PLACES, selectedId, onSelect);

  return { map, group, onSelect };
}

describe("drawPlaces", () => {
  it("adds one marker per place at its position, named by the place", () => {
    const { group } = setup();
    const markers = markersOf(group);

    expect(markers).toHaveLength(2);
    expect(markers[0]?.getLatLng()).toEqual(L.latLng(-7.215, -35.909));
    expect(markers[0]?.options.title).toBe("Praça central");
    expect(markers[1]?.options.title).toBe("Estacionamento");
    expect(markers[0]?.getElement()?.getAttribute("aria-label")).toBe("Praça central");
  });

  it("replaces the previous markers on a redraw", () => {
    const { group } = setup();

    drawPlaces(group, PLACES, null, vi.fn());

    expect(markersOf(group)).toHaveLength(2);
  });

  it("marks only the selected place", () => {
    const { group } = setup("p2");
    const [first, second] = markersOf(group).map((marker) => marker.getElement());

    expect(second?.querySelector(".place-pin-selected")).not.toBeNull();
    expect(first?.querySelector(".place-pin-selected")).toBeNull();
  });

  it("selects a place on click without letting the click reach the map", () => {
    const { map, group, onSelect } = setup();
    const onMapClick = vi.fn();
    map.on("click", onMapClick);

    markersOf(group)[1]?.getElement()?.click();

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("p2");
    expect(onMapClick).not.toHaveBeenCalled();
  });

  it("puts the icon anchor on the tip of the drop", () => {
    const { group } = setup();
    const icon = markersOf(group)[0]?.options.icon;

    expect(icon?.options.iconAnchor).toEqual([PIN_WIDTH / 2, PIN_HEIGHT]);
    expect(icon?.options.iconSize).toEqual([PIN_WIDTH, PIN_HEIGHT]);
  });
});
