import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { components } from "@/api/generated/schema";
import { FloorBlock } from "@/components/buildings/FloorBlock";
import {
  useApiClient,
  useBuildingFloors,
  useBuildingPoints,
  useBuildingRooms,
  useServiceTypes,
} from "@/components/buildings/useBuildingRecords";
import { RegistryNewButton } from "@/components/layout/Registry";
import { assertSaved } from "@/components/layout/registryForm";
import { EmptyState, ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { useTranslation } from "@/i18n/useTranslation";

type BuildingOut = components["schemas"]["BuildingOut"];

interface BuildingRoomsPanelProps {
  building: BuildingOut;
}

function useCreateFloor(buildingId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    // A new floor takes the next label (Térreo, 1, 2…) from the backend.
    mutationFn: async () => {
      const { response } = await client.POST("/floors", { body: { building_id: buildingId } });
      assertSaved(response, "POST /floors");
    },
    onSuccess: () => {
      // Prefix match: the board's floor lists and the point form's floor picker refresh too.
      void queryClient.invalidateQueries({ queryKey: ["floors"] });
    },
  });
}

/** A building's floors and rooms, inside its edit Dialog: one block per floor, and "Novo andar".
 * @example <BuildingRoomsPanel building={building} /> */
export function BuildingRoomsPanel({ building }: BuildingRoomsPanelProps) {
  const { t } = useTranslation();
  const floors = useBuildingFloors(building.id);
  const rooms = useBuildingRooms(building.id);
  const points = useBuildingPoints(building.id);
  const serviceTypes = useServiceTypes();
  const createFloor = useCreateFloor(building.id);
  // IMPORTANT: floors render only once rooms and points loaded too — until then a floor would read
  // as having no rooms and "Nova sala" would suggest a number that may already be taken.
  const queries = [floors, rooms, points];
  const loaded = floors.isSuccess && rooms.isSuccess && points.isSuccess;
  const title = t("roomsPanelTitle").replace("{name}", building.name);

  return (
    <section aria-labelledby="rooms-panel-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="rooms-panel-heading" className="text-foreground text-base font-bold">
          {title}
        </h2>
        <RegistryNewButton
          label={t("floorsNew")}
          onClick={() => {
            createFloor.mutate();
          }}
        />
      </div>
      {createFloor.isError && <ErrorMessage>{t("floorsCreateError")}</ErrorMessage>}
      {queries.some((query) => query.isError) ? (
        <ErrorMessage>{t("buildingPanelError")}</ErrorMessage>
      ) : (
        !loaded && <LoadingMessage>{t("buildingPanelLoading")}</LoadingMessage>
      )}
      {loaded && floors.data.length === 0 && <EmptyState>{t("roomsPanelEmpty")}</EmptyState>}
      {loaded &&
        floors.data.map((floor) => (
          <FloorBlock
            key={floor.id}
            floor={floor}
            rooms={rooms.data.filter((room) => room.floor_id === floor.id)}
            points={points.data.filter((point) => point.floor_id === floor.id)}
            serviceTypes={serviceTypes.data ?? []}
          />
        ))}
    </section>
  );
}
