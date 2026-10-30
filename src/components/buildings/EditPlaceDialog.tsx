import { useMutation } from "@tanstack/react-query";
import { MapPin, Trash2 } from "lucide-react";
import { useState } from "react";

import type { components } from "@/api/generated/schema";
import {
  type DeletionImpact,
  DeleteConfirmDialog,
} from "@/components/buildings/DeleteConfirmDialog";
import { PlaceServiceRow } from "@/components/buildings/PlaceServiceRow";
import { AddServiceForm, assertServiceAdded } from "@/components/buildings/RoomDialogs";
import {
  useApiClient,
  usePlacePoints,
  useRefreshPlaces,
  useServiceTypes,
} from "@/components/buildings/useBuildingRecords";
import { Field } from "@/components/layout/Registry";
import { assertSaved, RegistrySaveError } from "@/components/layout/registryForm";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

type PlaceOut = components["schemas"]["PlaceOut"];

interface EditPlaceDialogProps {
  place: PlaceOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Mover pin": the page closes this dialog and turns the pin tool on for this place. */
  onMove: () => void;
  /** The place is gone: the page clears its selection. */
  onDeleted: () => void;
}

function useRenamePlace(place: PlaceOut) {
  const client = useApiClient();
  const refresh = useRefreshPlaces();

  return useMutation({
    mutationFn: async (name: string) => {
      const { response } = await client.PATCH("/places/{place_id}", {
        params: { path: { place_id: place.id } },
        // Only the name: a position sent along could undo a move saved in the meantime.
        body: { name },
      });
      assertSaved(response, `PATCH /places/${place.id}`);
    },
    onSuccess: refresh,
  });
}

function RenamePlaceForm({ place }: { place: PlaceOut }) {
  const { t } = useTranslation();
  const [name, setName] = useState(place.name);
  const rename = useRenamePlace(place);
  const taken = rename.error instanceof RegistrySaveError && rename.error.status === 409;

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() !== "") {
          rename.mutate(name.trim());
        }
      }}
    >
      <Field>
        <Label htmlFor="rename-place">{t("placesFieldName")}</Label>
        <div className="flex gap-2">
          <Input
            id="rename-place"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <Button type="submit" variant="outline" disabled={rename.isPending || name.trim() === ""}>
            {t("placeRenameLabel")}
          </Button>
        </div>
      </Field>
      {rename.isError && (
        <ErrorMessage>{t(taken ? "placesNameTaken" : "placesSaveError")}</ErrorMessage>
      )}
    </form>
  );
}

function PlaceServices({ place }: { place: PlaceOut }) {
  const { t } = useTranslation();
  const client = useApiClient();
  const refresh = useRefreshPlaces();
  const points = usePlacePoints(place.id);
  const serviceTypes = useServiceTypes();
  const services = points.data ?? [];

  return (
    <div role="group" aria-label={t("placesFieldService")} className="space-y-2">
      {services.map((point) => (
        <PlaceServiceRow key={point.id} point={point} />
      ))}
      <AddServiceForm
        description={place.name}
        serviceTypes={serviceTypes.data ?? []}
        usedTypeIds={services.flatMap((point) => point.service_type_id ?? [])}
        existsMessage={t("placesServiceExists")}
        onSubmit={async (serviceTypeId) => {
          const { error, response } = await client.POST("/places/{place_id}/services", {
            params: { path: { place_id: place.id } },
            body: { service_type_id: serviceTypeId },
          });
          assertServiceAdded(
            response,
            error,
            "PLACE_SERVICE_EXISTS",
            `POST /places/${place.id}/services`,
          );
          refresh();
        }}
      />
    </div>
  );
}

function useRemovePlace(place: PlaceOut, onDeleted: () => void) {
  const client = useApiClient();
  const refresh = useRefreshPlaces();
  const path = { params: { path: { place_id: place.id } } };

  return {
    loadImpact: async (): Promise<DeletionImpact> => {
      const { data, response } = await client.GET("/places/{place_id}/deletion-impact", path);
      assertSaved(response, `GET /places/${place.id}/deletion-impact`);

      return data as DeletionImpact;
    },
    remove: async () => {
      const { response } = await client.DELETE("/places/{place_id}", path);
      assertSaved(response, `DELETE /places/${place.id}`);
    },
    done: () => {
      refresh();
      onDeleted();
    },
  };
}

/** Everything about one outdoor place, in a Dialog opened from its card on the map: name, its
 * services (on/off, add, remove), moving the pin and removing the place.
 * @example <EditPlaceDialog place={p} open onOpenChange={set} onMove={move} onDeleted={clear} /> */
export function EditPlaceDialog(props: EditPlaceDialogProps) {
  const { t } = useTranslation();
  const { place } = props;
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const removal = useRemovePlace(place, () => {
    setConfirmingRemoval(false);
    props.onOpenChange(false);
    props.onDeleted();
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("placesEditTitle")}</DialogTitle>
          <DialogDescription>{place.name}</DialogDescription>
        </DialogHeader>
        {/* Keyed by id: the name field starts from the place it was opened with. */}
        <RenamePlaceForm key={place.id} place={place} />
        <PlaceServices place={place} />
        <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              props.onOpenChange(false);
              props.onMove();
            }}
          >
            <MapPin aria-hidden="true" />
            {t("placesMove")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            aria-label={t("placesRemoveItem").replace("{name}", place.name)}
            onClick={() => {
              setConfirmingRemoval(true);
            }}
          >
            <Trash2 aria-hidden="true" />
            {t("deletionConfirm")}
          </Button>
        </div>
        {confirmingRemoval && (
          <DeleteConfirmDialog
            open
            onOpenChange={setConfirmingRemoval}
            title={t("removeTitle").replace("{name}", place.name)}
            impactKey={`place:${place.id}`}
            loadImpact={removal.loadImpact}
            onConfirm={removal.remove}
            onDeleted={removal.done}
            omit={["places"]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
