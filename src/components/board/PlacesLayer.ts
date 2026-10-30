import L from "leaflet";

/** An outdoor place ready to draw. `PlaceOut` from the API fits it as is. */
export interface MapPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export const PIN_WIDTH = 28;
export const PIN_HEIGHT = 36;

// An inverted teardrop: a circle on top narrowing to a point at the bottom centre (14, 35), where
// the icon anchor sits. Colours come from CSS (.place-pin in index.css), so tokens drive them.
const [W, H] = [String(PIN_WIDTH), String(PIN_HEIGHT)];
const PIN_SVG = `<svg class="place-pin-shape" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><path d="M14 35C14 35 3 22.5 3 14a11 11 0 0 1 22 0c0 8.5-11 21-11 21Z" stroke-width="2" stroke-linejoin="round"/><circle cx="14" cy="14" r="4"/></svg>`;

function pinIcon(selected: boolean): L.DivIcon {
  return L.divIcon({
    className: "place-pin-marker",
    html: `<div class="${selected ? "place-pin place-pin-selected" : "place-pin"}">${PIN_SVG}</div>`,
    iconSize: [PIN_WIDTH, PIN_HEIGHT],
    iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
  });
}

/** The pin shown while a new place waits for its name: same drop, in the selected look. */
export function draftPinIcon(): L.DivIcon {
  return pinIcon(true);
}

function drawPlace(
  group: L.LayerGroup,
  place: MapPlace,
  selectedId: string | null,
  onSelect: (id: string) => void,
): void {
  L.marker([place.latitude, place.longitude], {
    icon: pinIcon(place.id === selectedId),
    title: place.name,
    keyboard: true,
  })
    // The icon element exists only once the marker is on a map; give it its accessible name then.
    .on("add", (event) => {
      (event.target as L.Marker).getElement()?.setAttribute("aria-label", place.name);
    })
    .on("click", (event: L.LeafletMouseEvent) => {
      // Without this the click also reaches the map and would clear the selection at once.
      L.DomEvent.stopPropagation(event);
      onSelect(place.id);
    })
    .addTo(group);
}

/** Redraws the outdoor places as pins whose tip sits on the coordinate.
 * @example drawPlaces(group, places, selectedId, (id) => setSelected(id)) */
export function drawPlaces(
  group: L.LayerGroup,
  places: MapPlace[],
  selectedId: string | null,
  onSelect: (id: string) => void,
): void {
  group.clearLayers();
  for (const place of places) {
    drawPlace(group, place, selectedId, onSelect);
  }
}
