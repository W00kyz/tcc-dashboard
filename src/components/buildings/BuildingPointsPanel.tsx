import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { components } from "@/api/generated/schema";
import {
  type DeletionImpact,
  DeleteConfirmDialog,
} from "@/components/buildings/DeleteConfirmDialog";
import {
  useApiClient,
  useBuildingFloors,
  useBuildingPoints,
  useServiceTypes,
} from "@/components/buildings/useBuildingRecords";
import { Panel } from "@/components/layout/Page";
import { Field, RegistryList } from "@/components/layout/Registry";
import {
  RegistryDialog,
  type RegistryDialogState,
  useRegistryDialog,
} from "@/components/layout/RegistryDialog";
import { assertSaved, RegistryEditButton } from "@/components/layout/registryForm";
import { EmptyState } from "@/components/layout/StateMessages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/useTranslation";

type BuildingOut = components["schemas"]["BuildingOut"];
type FloorOut = components["schemas"]["FloorOut"];
type ServicePointOut = components["schemas"]["ServicePointOut"];
type ServiceTypeOut = components["schemas"]["ServiceTypeOut"];

const EMPTY_POINT = { floorId: "", name: "", description: "", serviceTypeId: "" };
type PointValues = typeof EMPTY_POINT;
type PointDialog = RegistryDialogState<PointValues>;

// Whatever lists a building's points, floors or counts refreshes after a change here.
function useRefreshCatalog() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: ["service-points"] });
  };
}

function useSavePoint(dialog: PointDialog) {
  const client = useApiClient();
  const refresh = useRefreshCatalog();

  return useMutation({
    mutationFn: async () => {
      const { form } = dialog;
      const shared = {
        name: form.values.name.trim(),
        description: form.values.description.trim(),
        service_type_id: form.values.serviceTypeId,
      };
      // A point has no location of its own (it is where its building is); the floor is fixed
      // once created.
      if (form.editingId !== null) {
        const { response } = await client.PATCH("/service-points/{point_id}", {
          params: { path: { point_id: form.editingId } },
          body: shared,
        });
        assertSaved(response, `PATCH /service-points/${form.editingId}`);

        return;
      }
      const { response } = await client.POST("/service-points", {
        body: { ...shared, floor_id: form.values.floorId },
      });
      assertSaved(response, "POST /service-points");
    },
    onSuccess: () => {
      dialog.close();
      refresh();
    },
  });
}

/** The types that can be picked, grouped by company; a type without a company cannot take
 * points (the API refuses it), so it is not offered. */
function groupByCompany(types: ServiceTypeOut[]): [string, ServiceTypeOut[]][] {
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

interface PointFieldsProps {
  dialog: PointDialog;
  floors: FloorOut[];
  serviceTypes: ServiceTypeOut[];
}

function PointFields({ dialog, floors, serviceTypes }: PointFieldsProps) {
  const { t } = useTranslation();
  const { form } = dialog;

  return (
    <>
      <Field>
        <Label htmlFor="point-floor">{t("servicePointsFieldFloor")}</Label>
        <NativeSelect
          id="point-floor"
          value={form.values.floorId}
          aria-invalid={form.isInvalid("floorId")}
          disabled={form.editingId !== null}
          onChange={(event) => {
            form.setField("floorId", event.target.value);
          }}
        >
          <NativeSelectOption value="" />
          {floors.map((floor) => (
            <NativeSelectOption key={floor.id} value={floor.id}>
              {floor.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {(["name", "description"] as const).map((field) => (
        <Field key={field}>
          <Label htmlFor={`point-${field}`}>
            {t(field === "name" ? "servicePointsFieldName" : "servicePointsFieldDescription")}
          </Label>
          <Input
            id={`point-${field}`}
            value={form.values[field]}
            aria-invalid={form.isInvalid(field)}
            onChange={(event) => {
              form.setField(field, event.target.value);
            }}
          />
        </Field>
      ))}
      <Field>
        <Label htmlFor="point-service-type">{t("servicePointsFieldServiceType")}</Label>
        <NativeSelect
          id="point-service-type"
          value={form.values.serviceTypeId}
          aria-invalid={form.isInvalid("serviceTypeId")}
          onChange={(event) => {
            form.setField("serviceTypeId", event.target.value);
          }}
        >
          <NativeSelectOption value="" />
          {groupByCompany(serviceTypes).map(([company, types]) => (
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
    </>
  );
}

interface PointRowProps {
  point: ServicePointOut;
  floorLabel: string;
  onEdit: () => void;
  onRemove: () => void;
}

function PointRow({ point, floorLabel, onEdit, onRemove }: PointRowProps) {
  const { t } = useTranslation();

  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block font-semibold">{point.name}</span>
        <span className="text-muted-foreground text-sm">
          {[floorLabel, point.description].filter((part) => part !== "").join(" · ")}
        </span>
        {point.service_type_name === null ? (
          <Badge variant="outline" className="ml-2">
            {t("servicePointWithoutType")}
          </Badge>
        ) : (
          <span className="text-muted-foreground ml-2 text-sm">{point.service_type_name}</span>
        )}
      </span>
      <RegistryEditButton itemName={point.name} onEdit={onEdit} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t("pointRemoveItem").replace("{name}", point.name)}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" />
        {t("deletionConfirm")}
      </Button>
    </>
  );
}

function useRemovePoint() {
  const client = useApiClient();
  const refresh = useRefreshCatalog();
  const [target, setTarget] = useState<ServicePointOut | null>(null);

  return {
    target,
    ask: setTarget,
    cancel: () => {
      setTarget(null);
    },
    loadImpact: async (): Promise<DeletionImpact> => {
      const { data, response } = await client.GET("/service-points/{point_id}/deletion-impact", {
        params: { path: { point_id: target?.id ?? "" } },
      });
      assertSaved(response, `GET /service-points/${target?.id ?? ""}/deletion-impact`);

      return data as DeletionImpact;
    },
    remove: async () => {
      const { response } = await client.DELETE("/service-points/{point_id}", {
        params: { path: { point_id: target?.id ?? "" } },
      });
      assertSaved(response, `DELETE /service-points/${target?.id ?? ""}`);
    },
    done: () => {
      setTarget(null);
      refresh();
    },
  };
}

interface BuildingPointsPanelProps {
  building: BuildingOut;
  /** Shown when the building is not on the map (no outline), where its card cannot be. */
  onEditBuilding?: () => void;
}

/** The selected building's service points, under the map: list, "Novo ponto", and per point
 * edit and remove, all in Dialogs. A point is floor, name, description and service type — it is
 * where its building is (spec 2026-10-20 §3.3).
 * @example <BuildingPointsPanel building={selected} /> */
export function BuildingPointsPanel({ building, onEditBuilding }: BuildingPointsPanelProps) {
  const { t } = useTranslation();
  const floors = useBuildingFloors(building.id);
  const points = useBuildingPoints(building.id);
  const serviceTypes = useServiceTypes();
  const dialog = useRegistryDialog(EMPTY_POINT, ["floorId", "name", "serviceTypeId"]);
  const save = useSavePoint(dialog);
  const removal = useRemovePoint();
  const floorList = floors.data ?? [];
  const floorLabel = (id: string) => floorList.find((floor) => floor.id === id)?.label ?? "";
  const hasOutline = Boolean(building.footprint);
  const title = t("pointsPanelTitle").replace("{name}", building.name);

  return (
    <section aria-labelledby="points-panel-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="points-panel-heading" className="text-foreground text-base font-bold">
          {title}
        </h2>
        <div className="flex flex-wrap gap-2">
          {onEditBuilding !== undefined && (
            <Button
              type="button"
              variant="outline"
              aria-label={t("registryEditItem").replace("{name}", building.name)}
              onClick={onEditBuilding}
            >
              <Pencil aria-hidden="true" />
              {t("registryEdit")}
            </Button>
          )}
          {hasOutline && (
            <Button
              type="button"
              onClick={() => {
                save.reset();
                dialog.openNew();
              }}
            >
              <Plus aria-hidden="true" />
              {t("pointsNew")}
            </Button>
          )}
        </div>
      </div>
      {!hasOutline && (
        <Panel className="p-4">
          <p className="text-sm">{t("pointsNeedOutline")}</p>
        </Panel>
      )}
      <RegistryList
        items={points.data}
        getKey={(point) => point.id}
        empty={t("buildingPointsEmpty")}
        renderItem={(point) => (
          <PointRow
            point={point}
            floorLabel={floorLabel(point.floor_id)}
            onEdit={() => {
              save.reset();
              dialog.openEdit(point.id, {
                floorId: point.floor_id,
                name: point.name,
                description: point.description,
                serviceTypeId: point.service_type_id ?? "",
              });
            }}
            onRemove={() => {
              removal.ask(point);
            }}
          />
        )}
      />
      <RegistryDialog
        dialog={dialog}
        save={save}
        onSubmit={() => {
          save.mutate();
        }}
        title={t(dialog.form.editingId === null ? "pointNewTitle" : "pointEditTitle")}
        createLabel={t("servicePointsSubmitCreate")}
        fieldLabels={{
          floorId: t("servicePointsFieldFloor"),
          name: t("servicePointsFieldName"),
          serviceTypeId: t("servicePointsFieldServiceType"),
        }}
      >
        {floorList.length === 0 ? (
          <EmptyState>{t("buildingPointsNeedFloor")}</EmptyState>
        ) : (
          <PointFields dialog={dialog} floors={floorList} serviceTypes={serviceTypes.data ?? []} />
        )}
      </RegistryDialog>
      {removal.target !== null && (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              removal.cancel();
            }
          }}
          title={t("removeTitle").replace("{name}", removal.target.name)}
          impactKey={`point:${removal.target.id}`}
          loadImpact={removal.loadImpact}
          onConfirm={removal.remove}
          onDeleted={removal.done}
        />
      )}
    </section>
  );
}
