import type L from "leaflet";

/**
 * Turns the next click on the map into a pin: the crosshair shows, one click calls `onPlaced`
 * with that point and the tool switches itself off; Escape calls `onExit`. Returns the function
 * that turns the tool off and gives the cursor back.
 * @example const stop = startPlacePinTool(map, (latLng) => openCreateDialog(latLng), stopPinning);
 */
export function startPlacePinTool(
  map: L.Map,
  onPlaced: (latLng: L.LatLng) => void,
  onExit?: () => void,
): () => void {
  const container = map.getContainer();
  container.classList.add("map-placing");
  let active = true;
  const stop = () => {
    if (!active) {
      return;
    }
    active = false;
    map.off("click", onClick);
    document.removeEventListener("keydown", onKey);
    container.classList.remove("map-placing");
  };
  const onClick = (event: L.LeafletMouseEvent) => {
    stop();
    onPlaced(event.latlng);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onExit?.();
    }
  };
  map.on("click", onClick);
  document.addEventListener("keydown", onKey);

  return stop;
}
