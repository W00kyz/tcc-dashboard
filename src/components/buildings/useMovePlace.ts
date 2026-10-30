import { useMutation } from "@tanstack/react-query";

import { OutsideCampusError, isOutsideCampus } from "@/components/buildings/placeErrors";
import type { PinPosition } from "@/components/buildings/usePlacePinning";
import { useApiClient, useRefreshPlaces } from "@/components/buildings/useBuildingRecords";
import { assertSaved } from "@/components/layout/registryForm";

/** Moves a place's pin: `PATCH /places/{id}` with only the new position. A position off the
 * campus fails with `OutsideCampusError`; success refreshes the places, so the pin moves.
 * @example const move = useMovePlace(); move.mutate({ placeId: "pl1", position: { lat, lng } }); */
export function useMovePlace() {
  const client = useApiClient();
  const refresh = useRefreshPlaces();

  return useMutation({
    mutationFn: async ({ placeId, position }: { placeId: string; position: PinPosition }) => {
      const request = `PATCH /places/${placeId}`;
      const { error, response } = await client.PATCH("/places/{place_id}", {
        params: { path: { place_id: placeId } },
        // Only the position: the name is not this call's to change.
        body: { latitude: position.lat, longitude: position.lng },
      });
      if (response.status === 422 && isOutsideCampus(error)) {
        throw new OutsideCampusError(request, position);
      }
      assertSaved(response, request);
    },
    onSuccess: refresh,
  });
}
