import { useMemo } from "react";

import type { components } from "@/api/generated/schema";
import type { PlacePanelProps } from "@/components/board/PlacePanel";
import type { MapPlace, PinStatuses } from "@/components/board/PlacesLayer";
import { STATUS_BADGE } from "@/components/board/pointStatusBadge";
import { useAllPoints, usePlaces } from "@/components/buildings/useBuildingRecords";
import { strings } from "@/i18n/strings";
import {
  type PlacePinStatus,
  type PointVisitStatus,
  placeStatusesForToday,
} from "@/lib/buildingInterior";

type PlaceOut = components["schemas"]["PlaceOut"];
type RouteOut = components["schemas"]["RouteOut"];

const NO_PLACES: PlaceOut[] = [];

// The pins speak the panel's vocabulary; a place whose stops all went back to the pool is "Liberado".
function pinLabel(status: PlacePinStatus): string {
  return status === "RELEASED" ? strings.stopStatusReleased : strings[STATUS_BADGE[status].label];
}

interface BoardPlacesInput {
  dayRoutes: RouteOut[];
  /** Today's status per service point, the same map the building panel reads. */
  pointStatuses: Map<string, PointVisitStatus>;
  selectedPlaceId: string | null;
  onClose: () => void;
}

/** Everything the board needs to show outdoor places: pins with today's status and the open
 * place's panel. A place with no stop today stays on the map, neutral.
 * @example const { mapPlaces, pinStatuses, placePanelProps } = useBoardPlaces(input); */
export function useBoardPlaces(input: BoardPlacesInput) {
  const places = usePlaces().data ?? NO_PLACES;
  const allPoints = useAllPoints();
  const pinStatuses = useMemo(() => placeStatusesForToday(input.dayRoutes), [input.dayRoutes]);
  const open = places.find((place) => place.id === input.selectedPlaceId);
  const mapPlaces: MapPlace[] = places;
  // Memoised: the map redraws its pins whenever this changes, and a redraw drops keyboard focus.
  const pinStatusesForMap: PinStatuses = useMemo(
    () => ({ of: (placeId) => pinStatuses.get(placeId) ?? "NOT_SCHEDULED", label: pinLabel }),
    [pinStatuses],
  );
  const placePanelProps: PlacePanelProps | null =
    open === undefined
      ? null
      : {
          place: { id: open.id, name: open.name },
          points: allPoints.data?.filter((point) => point.place_id === open.id),
          statuses: input.pointStatuses,
          isLoading: allPoints.isLoading,
          isError: allPoints.isError,
          onClose: input.onClose,
        };

  return {
    mapPlaces,
    pinStatuses: pinStatusesForMap,
    selectedPlaceId: open?.id ?? null,
    placePanelProps,
  };
}
