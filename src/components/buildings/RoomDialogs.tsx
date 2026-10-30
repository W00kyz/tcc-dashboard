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

const ROOM_SERVICE_EXISTS = "ROOM_SERVICE_EXISTS";

class RoomServiceExistsError extends Error {
  constructor(roomId: string) {
    super(`POST /rooms/${roomId}/services refused: the room already has that service type.`);
    this.name = "RoomServiceExistsError";
  }
}

// The API answers a repeated type with {"detail": {"code": "ROOM_SERVICE_EXISTS"}}.
function isServiceExists(error: unknown): boolean {
  const detail = (error as { detail?: { code?: string } } | undefined)?.detail;

  return detail?.code === ROOM_SERVICE_EXISTS;
}

interface AddServiceDialogProps {
  room: RoomOut;
  serviceTypes: ServiceTypeOut[];
  /** Types the room already has: a room takes each type once. */
  usedTypeIds: string[];
}

/** "Adicionar serviço" and its Dialog: one more service type for the room, grouped by company.
 * @example <AddServiceDialog room={room} serviceTypes={types} usedTypeIds={used} /> */
export function AddServiceDialog({ room, serviceTypes, usedTypeIds }: AddServiceDialogProps) {
  const { t } = useTranslation();
  const client = useApiClient();
  const refresh = useRefreshRooms();
  const dialog = useRegistryDialog({ serviceTypeId: "" }, ["serviceTypeId"]);
  const { form } = dialog;
  const save = useMutation({
    mutationFn: async () => {
      const { error, response } = await client.POST("/rooms/{room_id}/services", {
        params: { path: { room_id: room.id } },
        body: { service_type_id: form.values.serviceTypeId },
      });
      if (response.status === 409 && isServiceExists(error)) {
        throw new RoomServiceExistsError(room.id);
      }
      assertSaved(response, `POST /rooms/${room.id}/services`);
    },
    onSuccess: () => {
      dialog.close();
      refresh();
    },
  });
  const offered = serviceTypes.filter((type) => !usedTypeIds.includes(type.id));

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
        description={room.name}
        createLabel={t("roomsAddServiceSubmit")}
        fieldLabels={{ serviceTypeId: t("servicePointsFieldServiceType") }}
        saveErrorMessage={(error) =>
          error instanceof RoomServiceExistsError ? t("roomServiceExists") : null
        }
        onSubmit={() => {
          save.mutate();
        }}
      >
        <Field>
          <Label htmlFor="room-service-type">{t("servicePointsFieldServiceType")}</Label>
          <NativeSelect
            id="room-service-type"
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
