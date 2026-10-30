import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import type { components } from "@/api/generated/schema";
import {
  type DeletionImpact,
  DeleteConfirmDialog,
} from "@/components/buildings/DeleteConfirmDialog";
import { FloorQrActions } from "@/components/buildings/FloorQrActions";
import { NewRoomDialog, type RoomCleaning } from "@/components/buildings/NewRoomDialog";
import { RoomRow } from "@/components/buildings/RoomRow";
import { useApiClient } from "@/components/buildings/useBuildingRecords";
import { RegistryDialog, useRegistryDialog } from "@/components/layout/RegistryDialog";
import { assertSaved, RegistryEditButton } from "@/components/layout/registryForm";
import { EmptyState, ErrorMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

type FloorOut = components["schemas"]["FloorOut"];
type RoomOut = components["schemas"]["RoomOut"];
type ServicePointOut = components["schemas"]["ServicePointOut"];
type ServiceTypeOut = components["schemas"]["ServiceTypeOut"];

interface FloorBlockProps {
  floor: FloorOut;
  rooms: RoomOut[];
  points: ServicePointOut[];
  serviceTypes: ServiceTypeOut[];
}

function useRenameFloor(floor: FloorOut) {
  const queryClient = useQueryClient();
  const client = useApiClient();
  // The dialog only renames: a new floor takes the next label (Térreo, 1, 2…) from the backend.
  const dialog = useRegistryDialog({ label: "" }, ["label"]);
  const save = useMutation({
    mutationFn: async () => {
      const { response } = await client.PATCH("/floors/{floor_id}", {
        params: { path: { floor_id: floor.id } },
        body: { label: dialog.form.values.label.trim() },
      });
      assertSaved(response, `PATCH /floors/${floor.id}`);
    },
    onSuccess: () => {
      dialog.close();
      // Prefix match: the board's floor lists and the point form's floor picker refresh too.
      void queryClient.invalidateQueries({ queryKey: ["floors"] });
    },
  });

  return { dialog, save };
}

function useRemoveFloor(floor: FloorOut, onDone: () => void) {
  const queryClient = useQueryClient();
  const client = useApiClient();
  const path = { params: { path: { floor_id: floor.id } } };

  return {
    loadImpact: async (): Promise<DeletionImpact> => {
      const { data, response } = await client.GET("/floors/{floor_id}/deletion-impact", path);
      assertSaved(response, `GET /floors/${floor.id}/deletion-impact`);

      return data as DeletionImpact;
    },
    remove: async () => {
      const { response } = await client.DELETE("/floors/{floor_id}", path);
      assertSaved(response, `DELETE /floors/${floor.id}`);
    },
    done: () => {
      for (const queryKey of [["floors"], ["rooms"], ["service-points"]]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onDone();
    },
  };
}

// A room is created even when its Limpeza point could not be; these say why it is missing.
const NOTICE_KEY = {
  NO_CLEANING_TYPE: "roomsNoCleaningType",
  NO_OUTLINE: "roomsNoOutline",
} as const;

function CleaningNotice({ cleaning }: { cleaning: RoomCleaning | null }) {
  const { t } = useTranslation();
  if (cleaning !== "NO_CLEANING_TYPE" && cleaning !== "NO_OUTLINE") {
    return null;
  }

  return <ErrorMessage>{t(NOTICE_KEY[cleaning])}</ErrorMessage>;
}

/** One floor of the building: its label with rename and remove, its QR code actions and its
 * rooms with their services.
 * @example <FloorBlock floor={floor} rooms={rooms} points={points} serviceTypes={types} /> */
export function FloorBlock({ floor, rooms, points, serviceTypes }: FloorBlockProps) {
  const { t } = useTranslation();
  const [cleaning, setCleaning] = useState<RoomCleaning | null>(null);
  const { dialog, save } = useRenameFloor(floor);
  const { form } = dialog;
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const removal = useRemoveFloor(floor, () => {
    setConfirmingRemoval(false);
  });

  return (
    <div
      role="group"
      aria-label={floor.label}
      className="bg-card space-y-2 rounded-md border px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-foreground min-w-0 flex-1 font-semibold">{floor.label}</span>
        <RegistryEditButton
          itemName={floor.label}
          onEdit={() => {
            save.reset();
            dialog.openEdit(floor.id, { label: floor.label });
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("floorRemoveItem").replace("{name}", floor.label)}
          onClick={() => {
            setConfirmingRemoval(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          {t("deletionConfirm")}
        </Button>
      </div>
      <FloorQrActions floorId={floor.id} />
      <div className="space-y-2">
        {rooms.length === 0 && <EmptyState>{t("roomsEmpty")}</EmptyState>}
        {rooms.map((room) => (
          <RoomRow
            key={room.id}
            room={room}
            services={points.filter((point) => point.room_id === room.id)}
            serviceTypes={serviceTypes}
          />
        ))}
        <CleaningNotice cleaning={cleaning} />
        <NewRoomDialog floor={floor} rooms={rooms} onCreated={setCleaning} />
      </div>
      <RegistryDialog
        dialog={dialog}
        save={save}
        createLabel={t("registrySubmitEdit")}
        fieldLabels={{ label: t("floorsFieldLabel") }}
        onSubmit={() => {
          save.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="floor-label">{t("floorsFieldLabel")}</Label>
          <Input
            id="floor-label"
            value={form.values.label}
            aria-invalid={form.isInvalid("label")}
            onChange={(event) => {
              form.setField("label", event.target.value);
            }}
          />
        </div>
      </RegistryDialog>
      {confirmingRemoval && (
        <DeleteConfirmDialog
          open
          onOpenChange={setConfirmingRemoval}
          title={t("removeTitle").replace("{name}", floor.label)}
          impactKey={`floor:${floor.id}`}
          loadImpact={removal.loadImpact}
          onConfirm={removal.remove}
          onDeleted={removal.done}
          omit={["floors"]}
        />
      )}
    </div>
  );
}
