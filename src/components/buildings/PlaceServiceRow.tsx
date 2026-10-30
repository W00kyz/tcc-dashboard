import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import type { components } from "@/api/generated/schema";
import {
  type DeletionImpact,
  DeleteConfirmDialog,
} from "@/components/buildings/DeleteConfirmDialog";
import { useApiClient, useRefreshPlaces } from "@/components/buildings/useBuildingRecords";
import { assertSaved } from "@/components/layout/registryForm";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

type ServicePointOut = components["schemas"]["ServicePointOut"];

// Turning a service off keeps the point and its history; it only leaves the next allocations.
function useToggleService() {
  const client = useApiClient();
  const refresh = useRefreshPlaces();

  return useMutation({
    mutationFn: async ({ point, active }: { point: ServicePointOut; active: boolean }) => {
      const { response } = await client.PATCH("/service-points/{point_id}", {
        params: { path: { point_id: point.id } },
        // Only the flag: a cached name could overwrite the one a rename just synced from the place.
        body: { active },
      });
      assertSaved(response, `PATCH /service-points/${point.id}`);
    },
    onSuccess: refresh,
  });
}

// Removing one service of a place is removing its service point.
function useRemoveService(point: ServicePointOut, onDone: () => void) {
  const client = useApiClient();
  const refresh = useRefreshPlaces();
  const path = { params: { path: { point_id: point.id } } };

  return {
    loadImpact: async (): Promise<DeletionImpact> => {
      const { data, response } = await client.GET(
        "/service-points/{point_id}/deletion-impact",
        path,
      );
      assertSaved(response, `GET /service-points/${point.id}/deletion-impact`);

      return data as DeletionImpact;
    },
    remove: async () => {
      const { response } = await client.DELETE("/service-points/{point_id}", path);
      assertSaved(response, `DELETE /service-points/${point.id}`);
    },
    done: () => {
      refresh();
      onDone();
    },
  };
}

/** One service of an outdoor place: a checkbox (off = out of the next allocations, history kept)
 * and "Remover serviço", which asks first.
 * @example <PlaceServiceRow point={point} /> */
export function PlaceServiceRow({ point }: { point: ServicePointOut }) {
  const { t } = useTranslation();
  const toggle = useToggleService();
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const removal = useRemoveService(point, () => {
    setConfirmingRemoval(false);
  });
  const typeName = point.service_type_name ?? t("servicePointWithoutType");

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="font-normal">
          <input
            type="checkbox"
            checked={point.active}
            disabled={toggle.isPending}
            onChange={(event) => {
              toggle.mutate({ point, active: event.target.checked });
            }}
          />
          {typeName}
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("placesRemoveService").replace("{name}", typeName)}
          onClick={() => {
            setConfirmingRemoval(true);
          }}
        >
          <Trash2 aria-hidden="true" />
          {t("deletionConfirm")}
        </Button>
      </div>
      {toggle.isError && <ErrorMessage>{t("placesSaveError")}</ErrorMessage>}
      {confirmingRemoval && (
        <DeleteConfirmDialog
          open
          onOpenChange={setConfirmingRemoval}
          title={t("removeTitle").replace("{name}", typeName)}
          impactKey={`point:${point.id}`}
          loadImpact={removal.loadImpact}
          onConfirm={removal.remove}
          onDeleted={removal.done}
          omit={["points"]}
        />
      )}
    </div>
  );
}
