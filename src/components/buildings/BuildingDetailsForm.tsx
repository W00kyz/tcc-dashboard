import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { components } from "@/api/generated/schema";
import { useApiClient } from "@/components/buildings/useBuildingRecords";
import { Field } from "@/components/layout/Registry";
import { assertSaved } from "@/components/layout/registryForm";
import { ErrorMessage, SuccessMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

type BuildingOut = components["schemas"]["BuildingOut"];

function useSaveDetails(buildingId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { name: string; campus_area: string }) => {
      const { response } = await client.PATCH("/buildings/{building_id}", {
        params: { path: { building_id: buildingId } },
        body,
      });
      assertSaved(response, `PATCH /buildings/${buildingId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["buildings"] });
    },
  });
}

/** Name and campus area of a building, edited in place on its page.
 * @example <BuildingDetailsForm building={building} /> */
export function BuildingDetailsForm({ building }: { building: BuildingOut }) {
  const { t } = useTranslation();
  const [name, setName] = useState(building.name);
  const [campusArea, setCampusArea] = useState(building.campus_area);
  const [showMissing, setShowMissing] = useState(false);
  const save = useSaveDetails(building.id);
  const missing = [
    name.trim() === "" ? t("buildingsFieldName") : null,
    campusArea.trim() === "" ? t("buildingsFieldCampusArea") : null,
  ].filter((label) => label !== null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setShowMissing(missing.length > 0);
        if (missing.length === 0) {
          save.mutate({ name: name.trim(), campus_area: campusArea.trim() });
        }
      }}
    >
      <Field>
        <Label htmlFor="building-name">{t("buildingsFieldName")}</Label>
        <Input
          id="building-name"
          value={name}
          aria-invalid={showMissing && name.trim() === ""}
          onChange={(event) => {
            setName(event.target.value);
            save.reset();
          }}
        />
      </Field>
      <Field>
        <Label htmlFor="building-campus-area">{t("buildingsFieldCampusArea")}</Label>
        <Input
          id="building-campus-area"
          value={campusArea}
          aria-invalid={showMissing && campusArea.trim() === ""}
          onChange={(event) => {
            setCampusArea(event.target.value);
            save.reset();
          }}
        />
      </Field>
      {showMissing && missing.length > 0 && (
        <ErrorMessage>
          {t("registryMissingFields").replace("{fields}", missing.join(", "))}
        </ErrorMessage>
      )}
      {save.isError && <ErrorMessage>{t("registrySaveError")}</ErrorMessage>}
      {save.isSuccess && <SuccessMessage>{t("buildingDetailsSaved")}</SuccessMessage>}
      <Button type="submit" className="w-full" disabled={save.isPending}>
        {t("registrySubmitEdit")}
      </Button>
    </form>
  );
}
