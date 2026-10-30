import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { components } from "@/api/generated/schema";
import { useApiClient } from "@/components/buildings/useBuildingRecords";
import { Field } from "@/components/layout/Registry";
import { assertSaved, RegistryFormFooter, useRegistryForm } from "@/components/layout/registryForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import type { GeoPolygon } from "@/lib/osmBuildings";

type BuildingOut = components["schemas"]["BuildingOut"];

interface NewBuildingFormProps {
  /** The rectangle drawn on the map: every building is registered with its outline. */
  outline: GeoPolygon;
  onCancel: () => void;
  /** The building was created; the page selects it. */
  onCreated: (buildingId: string) => void;
}

function useCreateBuilding(outline: GeoPolygon, onCreated: (buildingId: string) => void) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const form = useRegistryForm({ name: "", campusArea: "" }, ["name", "campusArea"]);
  const save = useMutation({
    mutationFn: async (): Promise<BuildingOut> => {
      // One request: the building and its outline are created together or not at all.
      const { data, response } = await client.POST("/buildings", {
        body: {
          name: form.values.name.trim(),
          campus_area: form.values.campusArea.trim(),
          footprint: outline,
        },
      });
      assertSaved(response, "POST /buildings");

      return data as BuildingOut;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["buildings"] });
      // The server gave the building its Térreo: the campus card counts floors.
      void queryClient.invalidateQueries({ queryKey: ["floors"] });
      onCreated(created.id);
    },
  });

  return { form, save };
}

/** Name and campus area of the building just drawn on the map, created with that outline.
 * The page selects the new building once created.
 * @example <NewBuildingForm outline={drawnRectangle} onCancel={discardDrawing} /> */
export function NewBuildingForm({ outline, onCancel, onCreated }: NewBuildingFormProps) {
  const { t } = useTranslation();
  const { form, save } = useCreateBuilding(outline, onCreated);

  return (
    <form
      aria-label={t("buildingsNewTitle")}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (form.validate()) {
          save.mutate();
        }
      }}
    >
      <p className="text-foreground text-sm font-bold">{t("buildingsNewTitle")}</p>
      <Field>
        <Label htmlFor="new-building-name">{t("buildingsFieldName")}</Label>
        <Input
          id="new-building-name"
          value={form.values.name}
          aria-invalid={form.isInvalid("name")}
          onChange={(event) => {
            form.setField("name", event.target.value);
          }}
        />
      </Field>
      <Field>
        <Label htmlFor="new-building-campus-area">{t("buildingsFieldCampusArea")}</Label>
        <Input
          id="new-building-campus-area"
          value={form.values.campusArea}
          aria-invalid={form.isInvalid("campusArea")}
          onChange={(event) => {
            form.setField("campusArea", event.target.value);
          }}
        />
      </Field>
      <RegistryFormFooter
        form={form}
        save={save}
        createLabel={t("buildingsSubmitCreate")}
        fieldLabels={{
          name: t("buildingsFieldName"),
          campusArea: t("buildingsFieldCampusArea"),
        }}
      />
      <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
        {t("outlineCancel")}
      </Button>
    </form>
  );
}
