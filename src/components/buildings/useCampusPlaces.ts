import { useMemo } from "react";

import type { components } from "@/api/generated/schema";
import { useAllPoints, usePlaces } from "@/components/buildings/useBuildingRecords";

type PlaceOut = components["schemas"]["PlaceOut"];
type ServicePointOut = components["schemas"]["ServicePointOut"];

const NO_PLACES: PlaceOut[] = [];
const NO_POINTS: ServicePointOut[] = [];

/** Every outdoor place for the campus map and how many service points each has. Reads the same
 * campus-wide point list the building cards count from.
 * @example const { places, servicesOf } = useCampusPlaces(); servicesOf(place.id) // 2 */
export function useCampusPlaces() {
  const places = usePlaces().data ?? NO_PLACES;
  const points = useAllPoints().data ?? NO_POINTS;

  return useMemo(
    () => ({
      places,
      servicesOf: (placeId: string): number =>
        points.filter((point) => point.place_id === placeId).length,
    }),
    [places, points],
  );
}
