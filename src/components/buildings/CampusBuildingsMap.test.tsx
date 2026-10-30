import { render, screen } from "@testing-library/react";
import L from "leaflet";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CampusBuildingsMap } from "@/components/buildings/CampusBuildingsMap";

const PLACE = { id: "pl1", name: "Ponto de ônibus", latitude: -7.2155, longitude: -35.9085 };

function renderMap(place: typeof PLACE) {
  const element = (
    <CampusBuildingsMap
      buildings={[]}
      selectedId={null}
      onSelect={vi.fn()}
      places={[place]}
      selectedPlaceId={place.id}
      selectedPlaceCard={<p>Cartão do local</p>}
    />
  );

  return { element };
}

describe("CampusBuildingsMap selected place popup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("re-anchors the popup, with its card, when the selected place moves", () => {
    // Calls through: the popup is real, the spy only records where it is anchored.
    const setLatLng = vi.spyOn(L.Popup.prototype, "setLatLng");
    const view = render(renderMap(PLACE).element);
    expect(screen.getByText("Cartão do local")).toBeInTheDocument();
    setLatLng.mockClear();

    view.rerender(renderMap({ ...PLACE, latitude: -7.2161, longitude: -35.9092 }).element);

    const anchor = L.latLng(setLatLng.mock.calls.at(-1)?.[0] ?? [0, 0]);
    expect(anchor.lat).toBeCloseTo(-7.2161, 6);
    expect(anchor.lng).toBeCloseTo(-35.9092, 6);
    // One popup, not the old one left over the old spot plus a new one.
    expect(document.querySelectorAll(".leaflet-popup")).toHaveLength(1);
    expect(screen.getByText("Cartão do local")).toBeInTheDocument();
  });
});
