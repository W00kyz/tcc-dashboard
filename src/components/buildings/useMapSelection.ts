import { useSearchParams } from "react-router-dom";

/** What the Prédios map has open: a building (`?predio=`) or an outdoor place (`?local=`), never
 * both. The address carries it, so a link — and the old /predios/:id redirects — lands with it
 * open. The exclusion lives here: every selection replaces the whole query, so choosing one kind
 * drops the other, and `null` clears both.
 * @example const { buildingId, placeId, selectPlace } = useMapSelection(); */
export function useMapSelection() {
  const [params, setParams] = useSearchParams();
  const placeId = params.get("local");

  return {
    // A hand-written link with both: the place wins, so the page never shows two cards.
    buildingId: placeId === null ? params.get("predio") : null,
    placeId,
    selectBuilding: (buildingId: string | null) => {
      setParams(buildingId === null ? {} : { predio: buildingId });
    },
    selectPlace: (id: string | null) => {
      setParams(id === null ? {} : { local: id });
    },
  };
}
