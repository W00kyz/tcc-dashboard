import { useMutation } from "@tanstack/react-query";

import type { components } from "@/api/generated/schema";
import { useApiClient, useRefreshRooms } from "@/components/buildings/useBuildingRecords";
import { Field } from "@/components/layout/Registry";
import { RegistryDialog, useRegistryDialog } from "@/components/layout/RegistryDialog";
import { assertSaved } from "@/components/layout/registryForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/useTranslation";

type RoomOut = components["schemas"]["RoomOut"];
type ServiceTypeOut = components["schemas"]["ServiceTypeOut"];

/** The types that can be picked, grouped by company; a type without a company cannot take
 * points (the API refuses it), so it is not offered. */
export function groupByCompany(types: ServiceTypeOut[]): [string, ServiceTypeOut[]][] {
  const groups = new Map<string, ServiceTypeOut[]>();
  types.forEach((type) => {
    if (type.contractor_company_name === null) {
      return;
    }
    groups.set(type.contractor_company_name, [
      ...(groups.get(type.contractor_company_name) ?? []),
      type,
    ]);
  });

  return [...groups];
}

/** The API answered a service type the room or place already has (409 with the entity's own
 * `*_SERVICE_EXISTS` code). */
export class ServiceExistsError extends Error {
  constructor(request: string) {
    super(`${request} refused: it already has that service type.`);
    this.name = "ServiceExistsError";
  }
}

// The API answers a repeated type with {"detail": {"code": "ROOM_SERVICE_EXISTS"}} (or the
// PLACE_ one), so a 409 for another reason stays a plain save error.
function isServiceExists(error: unknown, code: string): boolean {
  const detail = (error as { detail?: { code?: string } } | undefined)?.detail;

  return detail?.code === code;
}

/** After a POST of a service type: throws `ServiceExistsError` for the 409 `code`, any other
 * refusal as a save error.
 * @example assertServiceAdded(response, error, "PLACE_SERVICE_EXISTS", `POST /places/${id}/services`) */
export function assertServiceAdded(
  response: Response,
  error: unknown,
  code: string,
  request: string,
): void {
  if (response.status === 409 && isServiceExists(error, code)) {
    throw new ServiceExistsError(request);
  }
  assertSaved(response, request);
}

interface AddServiceFormProps {
  /** What the service goes to (the room's or the place's name). */
  description: string;
  serviceTypes: ServiceTypeOut[];
  /** Types already there: a room or place takes each type once. */
  usedTypeIds: string[];
  /** Sends the chosen type; throws `ServiceExistsError` for a repeated one. */
  onSubmit: (serviceTypeId: string) => Promise<void>;
  /** The sentence for a repeated type. */
  existsMessage: string;
}

/** "Adicionar serviço" and its Dialog: one more service type, grouped by company. The room and
 * the place dialogs differ only in the endpoint they post to, which `onSubmit` owns. */
export function AddServiceForm(props: AddServiceFormProps) {
  const { t } = useTranslation();
  const dialog = useRegistryDialog({ serviceTypeId: "" }, ["serviceTypeId"]);
  const { form } = dialog;
  const save = useMutation({
    mutationFn: () => props.onSubmit(form.values.serviceTypeId),
    onSuccess: () => {
      dialog.close();
    },
  });
  const offered = props.serviceTypes.filter((type) => !props.usedTypeIds.includes(type.id));

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          save.reset();
          dialog.openNew();
        }}
      >
        {t("roomsAddService")}
      </Button>
      <RegistryDialog
        dialog={dialog}
        save={save}
        title={t("roomsAddService")}
        description={props.description}
        createLabel={t("roomsAddServiceSubmit")}
        fieldLabels={{ serviceTypeId: t("servicePointsFieldServiceType") }}
        saveErrorMessage={(error) =>
          error instanceof ServiceExistsError ? props.existsMessage : null
        }
        onSubmit={() => {
          save.mutate();
        }}
      >
        <Field>
          <Label htmlFor="add-service-type">{t("servicePointsFieldServiceType")}</Label>
          <NativeSelect
            id="add-service-type"
            value={form.values.serviceTypeId}
            aria-invalid={form.isInvalid("serviceTypeId")}
            onChange={(event) => {
              form.setField("serviceTypeId", event.target.value);
            }}
          >
            <NativeSelectOption value="" />
            {groupByCompany(offered).map(([company, types]) => (
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
      </RegistryDialog>
    </>
  );
}

interface AddServiceDialogProps {
  room: RoomOut;
  serviceTypes: ServiceTypeOut[];
  /** Types the room already has: a room takes each type once. */
  usedTypeIds: string[];
}

/** "Adicionar serviço" for a room: posts the type to the room and refreshes its points.
 * @example <AddServiceDialog room={room} serviceTypes={types} usedTypeIds={used} /> */
export function AddServiceDialog({ room, serviceTypes, usedTypeIds }: AddServiceDialogProps) {
  const { t } = useTranslation();
  const client = useApiClient();
  const refresh = useRefreshRooms();

  return (
    <AddServiceForm
      description={room.name}
      serviceTypes={serviceTypes}
      usedTypeIds={usedTypeIds}
      existsMessage={t("roomServiceExists")}
      onSubmit={async (serviceTypeId) => {
        const request = `POST /rooms/${room.id}/services`;
        const { error, response } = await client.POST("/rooms/{room_id}/services", {
          params: { path: { room_id: room.id } },
          body: { service_type_id: serviceTypeId },
        });
        assertServiceAdded(response, error, "ROOM_SERVICE_EXISTS", request);
        refresh();
      }}
    />
  );
}

/** "Renomear" and its Dialog: the name flows to the room's points on the backend.
 * @example <RenameRoomDialog room={room} /> */
export function RenameRoomDialog({ room }: { room: RoomOut }) {
  const { t } = useTranslation();
  const client = useApiClient();
  const refresh = useRefreshRooms();
  const dialog = useRegistryDialog({ name: "" }, ["name"]);
  const { form } = dialog;
  const save = useMutation({
    mutationFn: async () => {
      const { response } = await client.PATCH("/rooms/{room_id}", {
        params: { path: { room_id: room.id } },
        body: { name: form.values.name.trim() },
      });
      assertSaved(response, `PATCH /rooms/${room.id}`);
    },
    onSuccess: () => {
      dialog.close();
      refresh();
    },
  });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          save.reset();
          dialog.openEdit(room.id, { name: room.name });
        }}
      >
        {t("roomsRename")}
      </Button>
      <RegistryDialog
        dialog={dialog}
        save={save}
        title={t("roomsRename")}
        createLabel={t("registrySubmitEdit")}
        fieldLabels={{ name: t("roomsFieldRename") }}
        saveErrorMessage={() => t("roomsSaveError")}
        onSubmit={() => {
          save.mutate();
        }}
      >
        <Field>
          <Label htmlFor="room-rename">{t("roomsFieldRename")}</Label>
          <Input
            id="room-rename"
            value={form.values.name}
            aria-invalid={form.isInvalid("name")}
            onChange={(event) => {
              form.setField("name", event.target.value);
            }}
          />
        </Field>
      </RegistryDialog>
    </>
  );
}
