import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { components } from "@/api/generated/schema";
import { OutsideCampusError, isOutsideCampus } from "@/components/buildings/placeErrors";
import { groupByCompany } from "@/components/buildings/RoomDialogs";
import { useApiClient, useServiceTypes } from "@/components/buildings/useBuildingRecords";
import { Field } from "@/components/layout/Registry";
import {
  assertSaved,
  RegistryFormErrors,
  RegistrySaveError,
  useRegistryForm,
} from "@/components/layout/registryForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/useTranslation";

type PlaceOut = components["schemas"]["PlaceOut"];

interface LatLng {
  lat: number;
  lng: number;
}

function useCreatePlace(position: LatLng, onCreated: (placeId: string) => void) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const form = useRegistryForm({ name: "", serviceTypeId: "" }, ["name", "serviceTypeId"]);
  const save = useMutation({
    mutationFn: async (): Promise<PlaceOut> => {
      const { data, error, response } = await client.POST("/places", {
        body: {
          name: form.values.name.trim(),
          latitude: position.lat,
          longitude: position.lng,
          service_type_id: form.values.serviceTypeId,
        },
      });
      if (response.status === 422 && isOutsideCampus(error)) {
        throw new OutsideCampusError("POST /places", position);
      }
      assertSaved(response, "POST /places");

      return data as PlaceOut;
    },
    onSuccess: (place) => {
      // The place comes with its first service point: both lists change.
      void queryClient.invalidateQueries({ queryKey: ["places"] });
      void queryClient.invalidateQueries({ queryKey: ["service-points"] });
      onCreated(place.id);
    },
  });

  return { form, save };
}

interface NewPlaceDialogProps {
  /** Where the pin was placed on the map; shown for context, not editable. */
  position: LatLng;
  onClose: () => void;
  /** The place exists; the page selects it. The dialog closes itself right after. */
  onCreated: (placeId: string) => void;
}

/** "Novo local" Dialog: the name and the first service of the outdoor place just pinned, created
 * at that position. Stays open with the reason when the API refuses.
 * @example <NewPlaceDialog position={{ lat: -7.21, lng: -35.9 }} onClose={drop} onCreated={select} /> */
export function NewPlaceDialog({ position, onClose, onCreated }: NewPlaceDialogProps) {
  const { t } = useTranslation();
  const serviceTypes = useServiceTypes();
  const { form, save } = useCreatePlace(position, (placeId) => {
    onCreated(placeId);
    onClose();
  });
  const fieldLabels = { name: t("placesFieldName"), serviceTypeId: t("placesFieldService") };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (form.validate()) {
              save.mutate();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("placesNewTitle")}</DialogTitle>
            <DialogDescription>
              {t("placesPosition")
                .replace("{lat}", String(position.lat))
                .replace("{lng}", String(position.lng))}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <Label htmlFor="new-place-name">{t("placesFieldName")}</Label>
            <Input
              id="new-place-name"
              value={form.values.name}
              aria-invalid={form.isInvalid("name")}
              onChange={(event) => {
                form.setField("name", event.target.value);
              }}
            />
          </Field>
          <Field>
            <Label htmlFor="new-place-service">{t("placesFieldService")}</Label>
            <NativeSelect
              id="new-place-service"
              value={form.values.serviceTypeId}
              aria-invalid={form.isInvalid("serviceTypeId")}
              onChange={(event) => {
                form.setField("serviceTypeId", event.target.value);
              }}
            >
              <NativeSelectOption value="" />
              {groupByCompany(serviceTypes.data ?? []).map(([company, types]) => (
                <NativeSelectOptGroup key={company} label={company}>
                  {types.map((type) => (
                    <NativeSelectOption key={type.id} value={type.id}>
                      {type.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelectOptGroup>
              ))}
            </NativeSelect>
          </Field>
          <RegistryFormErrors
            form={form}
            save={save}
            fieldLabels={fieldLabels}
            saveErrorMessage={(error) => createErrorMessage(t, error)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("registryDialogCancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {t("servicePointsSubmitCreate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function createErrorMessage(t: ReturnType<typeof useTranslation>["t"], error: Error): string {
  if (error instanceof OutsideCampusError) {
    return t("placesOutsideCampus");
  }

  return error instanceof RegistrySaveError && error.status === 409
    ? t("placesNameTaken")
    : t("placesCreateError");
}
