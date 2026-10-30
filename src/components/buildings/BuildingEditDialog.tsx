import { useQueryClient } from "@tanstack/react-query";
import { SquareDashed, Trash2 } from "lucide-react";
import { useState } from "react";

import type { components } from "@/api/generated/schema";
import { BuildingDetailsForm } from "@/components/buildings/BuildingDetailsForm";
import { BuildingRoomsPanel } from "@/components/buildings/BuildingRoomsPanel";
import {
  type DeletionImpact,
  DeleteConfirmDialog,
} from "@/components/buildings/DeleteConfirmDialog";
import { useApiClient } from "@/components/buildings/useBuildingRecords";
import { assertSaved } from "@/components/layout/registryForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/useTranslation";

type BuildingOut = components["schemas"]["BuildingOut"];

interface BuildingEditDialogProps {
  building: BuildingOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Redesenhar contorno": the page closes this dialog and turns the rectangle tool on. */
  onRedraw: () => void;
  onDeleted: () => void;
}

function useRemoveBuilding(building: BuildingOut, onDeleted: () => void) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const path = { params: { path: { building_id: building.id } } };

  return {
    loadImpact: async (): Promise<DeletionImpact> => {
      const { data, response } = await client.GET("/buildings/{building_id}/deletion-impact", path);
      assertSaved(response, `GET /buildings/${building.id}/deletion-impact`);

      return data as DeletionImpact;
    },
    remove: async () => {
      const { response } = await client.DELETE("/buildings/{building_id}", path);
      assertSaved(response, `DELETE /buildings/${building.id}`);
    },
    done: () => {
      for (const queryKey of [["buildings"], ["floors"], ["service-points"]]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onDeleted();
    },
  };
}

/** Everything about one building, in a Dialog opened from its card on the map: name and campus
 * area, its floors and rooms, redrawing the outline, removing it.
 * @example <BuildingEditDialog building={b} open onOpenChange={set} onRedraw={r} onDeleted={d} /> */
export function BuildingEditDialog(props: BuildingEditDialogProps) {
  const { t } = useTranslation();
  const { building } = props;
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const removal = useRemoveBuilding(building, () => {
    setConfirmingRemoval(false);
    props.onDeleted();
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("buildingEditTitle")}</DialogTitle>
          <DialogDescription>{building.name}</DialogDescription>
        </DialogHeader>
        {/* Keyed by id: the name/area form starts from the building it was opened with. */}
        <BuildingDetailsForm key={building.id} building={building} />
        <BuildingRoomsPanel key={`rooms:${building.id}`} building={building} />
        <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={props.onRedraw}>
            <SquareDashed aria-hidden="true" />
            {t("buildingRedraw")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setConfirmingRemoval(true);
            }}
          >
            <Trash2 aria-hidden="true" />
            {t("buildingRemove")}
          </Button>
        </div>
        {confirmingRemoval && (
          <DeleteConfirmDialog
            open
            onOpenChange={setConfirmingRemoval}
            title={t("removeTitle").replace("{name}", building.name)}
            impactKey={`building:${building.id}`}
            loadImpact={removal.loadImpact}
            onConfirm={removal.remove}
            onDeleted={removal.done}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
