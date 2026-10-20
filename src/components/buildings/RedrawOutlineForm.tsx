import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { components } from "@/api/generated/schema";
import { useApiClient } from "@/components/buildings/useBuildingRecords";
import { assertSaved } from "@/components/layout/registryForm";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";
import type { GeoPolygon } from "@/lib/osmBuildings";

type BuildingOut = components["schemas"]["BuildingOut"];

interface RedrawOutlineFormProps {
  building: BuildingOut;
  outline: GeoPolygon;
  onDone: () => void;
  onCancel: () => void;
}

/** In the popup over a rectangle drawn to replace a building's outline: confirm or cancel.
 * Its points follow the new outline (the server re-centres them).
 * @example <RedrawOutlineForm building={b} outline={rect} onDone={d} onCancel={c} /> */
export function RedrawOutlineForm({ building, outline, onDone, onCancel }: RedrawOutlineFormProps) {
  const { t } = useTranslation();
  const client = useApiClient();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      const { response } = await client.PUT("/buildings/{building_id}/footprint", {
        params: { path: { building_id: building.id } },
        body: { footprint: outline },
      });
      assertSaved(response, `PUT /buildings/${building.id}/footprint`);
    },
    onSuccess: () => {
      for (const queryKey of [["buildings"], ["service-points"]]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onDone();
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm">{t("redrawConfirmText").replace("{name}", building.name)}</p>
      {save.isError && <ErrorMessage>{t("redrawError")}</ErrorMessage>}
      <Button
        type="button"
        className="w-full"
        disabled={save.isPending}
        onClick={() => {
          save.mutate();
        }}
      >
        {t("redrawConfirm")}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
        {t("registryDialogCancel")}
      </Button>
    </div>
  );
}
