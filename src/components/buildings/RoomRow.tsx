import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import type { components } from "@/api/generated/schema";
import {
  type DeletionImpact,
  DeleteConfirmDialog,
} from "@/components/buildings/DeleteConfirmDialog";
import { AddServiceDialog, RenameRoomDialog } from "@/components/buildings/RoomDialogs";
import { useApiClient, useRefreshRooms } from "@/components/buildings/useBuildingRecords";
import { assertSaved } from "@/components/layout/registryForm";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

type RoomOut = components["schemas"]["RoomOut"];
type ServicePointOut = components["schemas"]["ServicePointOut"];
type ServiceTypeOut = components["schemas"]["ServiceTypeOut"];

interface RoomRowProps {
  room: RoomOut;
  /** The room's own service points, inactive ones included. */
  services: ServicePointOut[];
  serviceTypes: ServiceTypeOut[];
}

// Turning a service off keeps the point and its history; it only leaves the next allocations.
function useToggleService() {
  const client = useApiClient();
  const refresh = useRefreshRooms();

  return useMutation({
    mutationFn: async ({ point, active }: { point: ServicePointOut; active: boolean }) => {
      const { response } = await client.PATCH("/service-points/{point_id}", {
        params: { path: { point_id: point.id } },
        // Only the flag: a cached name could overwrite the one a rename just synced from the room.
        body: { active },
      });
      assertSaved(response, `PATCH /service-points/${point.id}`);
    },
    onSuccess: refresh,
  });
}

function useRemoveRoom(room: RoomOut, onDone: () => void) {
  const client = useApiClient();
  const refresh = useRefreshRooms();
  const path = { params: { path: { room_id: room.id } } };

  return {
    loadImpact: async (): Promise<DeletionImpact> => {
      const { data, response } = await client.GET("/rooms/{room_id}/deletion-impact", path);
      assertSaved(response, `GET /rooms/${room.id}/deletion-impact`);

      return data as DeletionImpact;
    },
    remove: async () => {
      const { response } = await client.DELETE("/rooms/{room_id}", path);
      assertSaved(response, `DELETE /rooms/${room.id}`);
    },
    done: () => {
      refresh();
      onDone();
    },
  };
}

/** One room of a floor: its name, a checkbox per service (off = out of the next allocations,
 * history kept), and add service, rename and remove.
 * @example <RoomRow room={room} services={roomPoints} serviceTypes={types} /> */
export function RoomRow({ room, services, serviceTypes }: RoomRowProps) {
  const { t } = useTranslation();
  const toggle = useToggleService();
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const removal = useRemoveRoom(room, () => {
    setConfirmingRemoval(false);
  });

  return (
    <div role="group" aria-label={room.name} className="space-y-2 border-t pt-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-foreground min-w-0 flex-1 font-medium">{room.name}</span>
        {services.map((point) => (
          <Label key={point.id} className="font-normal">
            <input
              type="checkbox"
              checked={point.active}
              disabled={toggle.isPending}
              onChange={(event) => {
                toggle.mutate({ point, active: event.target.checked });
              }}
            />
            {point.service_type_name ?? t("servicePointWithoutType")}
          </Label>
        ))}
        <AddServiceDialog
          room={room}
          serviceTypes={serviceTypes}
          usedTypeIds={services.flatMap((point) => point.service_type_id ?? [])}
        />
        <RenameRoomDialog room={room} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("roomRemoveItem").replace("{name}", room.name)}
          onClick={() => {
            setConfirmingRemoval(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          {t("deletionConfirm")}
        </Button>
      </div>
      {toggle.isError && <ErrorMessage>{t("roomsSaveError")}</ErrorMessage>}
      {confirmingRemoval && (
        <DeleteConfirmDialog
          open
          onOpenChange={setConfirmingRemoval}
          title={t("removeTitle").replace("{name}", room.name)}
          impactKey={`room:${room.id}`}
          loadImpact={removal.loadImpact}
          onConfirm={removal.remove}
          onDeleted={removal.done}
          omit={["rooms"]}
        />
      )}
    </div>
  );
}
