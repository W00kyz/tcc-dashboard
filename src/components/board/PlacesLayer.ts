import L from "leaflet";

import type { PlacePinStatus } from "@/lib/buildingInterior";

/** An outdoor place ready to draw. `PlaceOut` from the API fits it as is. */
export interface MapPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

/** What a place's popup belongs to. The coordinates are part of it: a popup is opened once per
 * key, so moving the place has to change the key or the popup would stay over the old spot.
 * @example placePopupKey({ id: "p1", name: "Praça", latitude: -7.2, longitude: -35.9 }) */
export function placePopupKey(place: MapPlace): string {
  return `${place.id}@${String(place.latitude)},${String(place.longitude)}`;
}

export const PIN_WIDTH = 28;
export const PIN_HEIGHT = 36;

// An inverted teardrop: a circle on top narrowing to a point at the bottom centre (14, 35), where
// the icon anchor sits. Colours come from CSS (.place-pin in index.css), so tokens drive them.
const [W, H] = [String(PIN_WIDTH), String(PIN_HEIGHT)];
const PIN_SVG = `<svg class="place-pin-shape" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><path d="M14 35C14 35 3 22.5 3 14a11 11 0 0 1 22 0c0 8.5-11 21-11 21Z" stroke-width="2" stroke-linejoin="round"/><circle cx="14" cy="14" r="4"/></svg>`;

/** How the board colours the pins: today's visit status per place, and its words for assistive
 * tech (colour alone says nothing to a screen reader). Optional: the cadastre draws plain pins. */
export interface PinStatuses {
  of: (placeId: string) => PlacePinStatus;
  label: (status: PlacePinStatus) => string;
}

// "IN_PROGRESS" -> "place-pin-status-in-progress"; the colours live in index.css.
function statusClass(status: PlacePinStatus): string {
  return `place-pin-status-${status.toLowerCase().replaceAll("_", "-")}`;
}

function pinClass(selected: boolean, status: PlacePinStatus | null): string {
  return [
    "place-pin",
    selected ? "place-pin-selected" : null,
    status === null ? null : statusClass(status),
  ]
    .filter((name) => name !== null)
    .join(" ");
}

function pinIcon(selected: boolean, status: PlacePinStatus | null = null): L.DivIcon {
  return L.divIcon({
    className: "place-pin-marker",
    html: `<div class="${pinClass(selected, status)}">${PIN_SVG}</div>`,
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
  statuses?: PinStatuses,
): void {
  const status = statuses?.of(place.id) ?? null;
  const accessibleName =
    status === null || statuses === undefined
      ? place.name
      : `${place.name}, ${statuses.label(status)}`;
  L.marker([place.latitude, place.longitude], {
    icon: pinIcon(place.id === selectedId, status),
    title: place.name,
    keyboard: true,
  })
    // The icon element exists only once the marker is on a map; give it its accessible name then.
    .on("add", (event) => {
      (event.target as L.Marker).getElement()?.setAttribute("aria-label", accessibleName);
    })
    .on("click", (event: L.LeafletMouseEvent) => {
      // Without this the click also reaches the map and would clear the selection at once.
      L.DomEvent.stopPropagation(event);
      onSelect(place.id);
    })
    .addTo(group);
}

/** Redraws the outdoor places as pins whose tip sits on the coordinate; with `statuses` each pin
 * also carries today's visit status.
 * @example drawPlaces(group, places, selectedId, (id) => setSelected(id)) */
export function drawPlaces(
  group: L.LayerGroup,
  places: MapPlace[],
  selectedId: string | null,
  onSelect: (id: string) => void,
  statuses?: PinStatuses,
): void {
  group.clearLayers();
  for (const place of places) {
    drawPlace(group, place, selectedId, onSelect, statuses);
  }
}
