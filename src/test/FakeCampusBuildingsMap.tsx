import type { CampusBuildingsMapProps } from "@/components/buildings/CampusBuildingsMap";
import type { GeoPolygon } from "@/lib/osmBuildings";

/** The rectangle a test "drags" on the fake map. */
export const DRAWN_RECTANGLE: GeoPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [-35.91, -7.21],
      [-35.9, -7.21],
      [-35.9, -7.22],
      [-35.91, -7.22],
      [-35.91, -7.21],
    ],
  ],
};

/** The point a test "clicks" on the fake map with the pin tool. */
export const PINNED_POINT = { lat: -7.2155, lng: -35.9085 };

/**
 * Stands in for the Leaflet campus map in component tests (jsdom cannot click or drag Leaflet):
 * each drawn building becomes a button, a click on empty map another, the rectangle tool a
 * button that "drags" DRAWN_RECTANGLE, the pin tool a button that "clicks" PINNED_POINT, each
 * outdoor place a button, and each popup a group holding what the page renders in it.
 * @example vi.mock("@/components/buildings/CampusBuildingsMap", async () => ({
 *   CampusBuildingsMap: (await import("@/test/FakeCampusBuildingsMap")).FakeCampusBuildingsMap }));
 */
export function FakeCampusBuildingsMap(props: CampusBuildingsMapProps) {
  return (
    <div role="region" aria-label="mapa dos prédios">
      {props.buildings.map((building) => (
        <button
          key={building.id}
          type="button"
          aria-pressed={building.id === props.selectedId}
          onClick={() => {
            props.onSelect(building.id);
          }}
        >
          {building.name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          props.onSelect(null);
        }}
      >
        clicar fora dos prédios
      </button>
      {props.drawing === true && (
        <button
          type="button"
          onClick={() => {
            props.onDrawn?.(DRAWN_RECTANGLE);
          }}
        >
          arrastar um retângulo no mapa
        </button>
      )}
      {props.places?.map((place) => (
        <button
          key={place.id}
          type="button"
          aria-pressed={place.id === props.selectedPlaceId}
          onClick={() => {
            props.onSelectPlace?.(place.id);
          }}
        >
          {place.name}
        </button>
      ))}
      {props.pinning === true && (
        <button
          type="button"
          onClick={() => {
            props.onPinned?.(PINNED_POINT);
          }}
        >
          clicar no mapa para marcar o local
        </button>
      )}
      {props.selectedId !== null && props.selectedCard !== undefined && (
        <div role="group" aria-label="popup do prédio selecionado">
          {props.selectedCard}
        </div>
      )}
      {props.selectedPlaceId != null && props.selectedPlaceCard !== undefined && (
        <div role="group" aria-label="popup do local selecionado">
          {props.selectedPlaceCard}
        </div>
      )}
      {props.draftPin != null && props.draftPinForm !== undefined && (
        <div role="group" aria-label="popup do local marcado">
          {props.draftPinForm}
          <button type="button" onClick={props.onDiscardDraftPin}>
            fechar popup do local
          </button>
        </div>
      )}
      {props.draft && (
        <div role="group" aria-label="popup do prédio desenhado">
          {props.draftForm}
          <button type="button" onClick={props.onDiscardDraft}>
            fechar popup
          </button>
        </div>
      )}
    </div>
  );
}
