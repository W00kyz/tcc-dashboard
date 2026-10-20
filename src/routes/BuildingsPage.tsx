import { SquareDashed } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { components } from "@/api/generated/schema";
import { BuildingEditDialog } from "@/components/buildings/BuildingEditDialog";
import { BuildingPointsPanel } from "@/components/buildings/BuildingPointsPanel";
import { BuildingSummaryCard } from "@/components/buildings/BuildingSummaryCard";
import { CampusBuildingsMap } from "@/components/buildings/CampusBuildingsMap";
import { NewBuildingForm } from "@/components/buildings/NewBuildingForm";
import { RedrawOutlineForm } from "@/components/buildings/RedrawOutlineForm";
import { useCampusBuildingMap } from "@/components/buildings/useCampusBuildingMap";
import { Page, PageHeader, Panel } from "@/components/layout/Page";
import { Field } from "@/components/layout/Registry";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/useTranslation";
import type { GeoPolygon } from "@/lib/osmBuildings";

type BuildingOut = components["schemas"]["BuildingOut"];

const byName = (a: BuildingOut, b: BuildingOut) => a.name.localeCompare(b.name, "pt-BR");

// The selected building lives in the address (`?predio=`), so a link — and the old
// /predios/:id pages, now redirects — lands with it open.
function useSelectedBuilding() {
  const [params, setParams] = useSearchParams();

  return {
    selectedId: params.get("predio"),
    select: (buildingId: string | null) => {
      setParams(buildingId === null ? {} : { predio: buildingId });
    },
  };
}

// Polygons are SVG paths with no accessible name: this picker is the keyboard and screen reader
// route to the same buildings.
function BuildingPicker(props: { buildings: BuildingOut[]; onSelect: (id: string) => void }) {
  const { t } = useTranslation();

  return (
    <Field className="w-full sm:w-72">
      <Label htmlFor="building-picker">{t("buildingsGoTo")}</Label>
      <NativeSelect
        id="building-picker"
        value=""
        onChange={(event) => {
          props.onSelect(event.target.value);
        }}
      >
        <NativeSelectOption value="">{t("buildingsGoToPlaceholder")}</NativeSelectOption>
        {[...props.buildings].sort(byName).map((building) => (
          <NativeSelectOption key={building.id} value={building.id}>
            {building.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

function OffMapBuildings(props: { buildings: BuildingOut[]; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  if (props.buildings.length === 0) {
    return null;
  }

  return (
    <p className="text-muted-foreground px-1 text-sm">
      {t("buildingsOffMap")}{" "}
      {[...props.buildings].sort(byName).map((building, index) => (
        <span key={building.id}>
          {index > 0 && ", "}
          <button
            type="button"
            className="text-foreground underline"
            onClick={() => {
              props.onSelect(building.id);
            }}
          >
            {building.name.trim() === "" ? t("buildingsUnnamed") : building.name}
          </button>
        </span>
      ))}
    </p>
  );
}

/** The rectangle tool: drawing a new building, or a new outline for `redrawFor`. */
function useRectangleDrawing() {
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<GeoPolygon | null>(null);
  const [redrawFor, setRedrawFor] = useState<BuildingOut | null>(null);
  const reset = () => {
    setDrawing(false);
    setDraft(null);
    setRedrawFor(null);
  };

  return {
    drawing,
    draft,
    redrawFor,
    toggle: () => {
      const wasDrawing = drawing;
      reset();
      setDrawing(!wasDrawing);
    },
    redraw: (building: BuildingOut) => {
      reset();
      setRedrawFor(building);
      setDrawing(true);
    },
    // One rectangle at a time: the tool turns off and the popup takes over.
    finish: (outline: GeoPolygon) => {
      setDrawing(false);
      setDraft(outline);
    },
    stop: reset,
    discard: reset,
  };
}

type Drawing = ReturnType<typeof useRectangleDrawing>;

function drawingHint(t: ReturnType<typeof useTranslation>["t"], drawing: Drawing): string {
  if (drawing.redrawFor !== null) {
    return t("redrawHint").replace("{name}", drawing.redrawFor.name);
  }

  return t(drawing.drawing ? "buildingsDrawingHint" : "buildingsMapHint");
}

function DraftForm(props: { drawing: Drawing; onCreated: (id: string) => void }) {
  const { drawing } = props;
  if (drawing.draft === null) {
    return null;
  }
  if (drawing.redrawFor !== null) {
    return (
      <RedrawOutlineForm
        building={drawing.redrawFor}
        outline={drawing.draft}
        onDone={drawing.discard}
        onCancel={drawing.discard}
      />
    );
  }

  return (
    <NewBuildingForm
      outline={drawing.draft}
      onCancel={drawing.discard}
      onCreated={(id) => {
        drawing.discard();
        props.onCreated(id);
      }}
    />
  );
}

/** Every building on campus, on the map. Clicking one opens its card (name, floors, points and
 * the pencil to its edit Dialog) and lists its service points below the map; drawing a rectangle
 * registers a new one. All creating and editing happens in Dialogs and map popups. */
export function BuildingsPage() {
  const { t } = useTranslation();
  const { selectedId, select } = useSelectedBuilding();
  const { buildings, mapBuildings, offMap, countsOf } = useCampusBuildingMap();
  const drawing = useRectangleDrawing();
  const [editing, setEditing] = useState(false);
  const selected = buildings.find((building) => building.id === selectedId);
  const onMap = mapBuildings.some((building) => building.id === selectedId);
  const busyDrawing = drawing.drawing || drawing.draft !== null;

  return (
    <Page width="wide">
      <PageHeader title={t("buildingsPageTitle")} description={t("buildingsPageDescription")} />
      <Panel className="space-y-3 p-3">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <BuildingPicker buildings={buildings} onSelect={select} />
          <Button
            type="button"
            aria-pressed={drawing.drawing && drawing.redrawFor === null}
            onClick={() => {
              select(null);
              drawing.toggle();
            }}
          >
            <SquareDashed aria-hidden="true" />
            {t(drawing.drawing ? "buildingsDrawingStop" : "buildingsDrawRectangle")}
          </Button>
        </div>
        <p aria-live="polite" className="text-muted-foreground px-1 text-sm">
          {drawingHint(t, drawing)}
        </p>
        <CampusBuildingsMap
          buildings={mapBuildings}
          selectedId={selectedId}
          onSelect={select}
          // The card steps aside while a rectangle is being drawn or confirmed.
          selectedCard={
            selected === undefined || busyDrawing ? undefined : (
              <BuildingSummaryCard
                name={selected.name}
                counts={countsOf(selected.id)}
                onEdit={() => {
                  setEditing(true);
                }}
              />
            )
          }
          drawing={drawing.drawing}
          onDrawn={drawing.finish}
          onExitDrawing={drawing.stop}
          draft={drawing.draft}
          onDiscardDraft={drawing.discard}
          draftForm={<DraftForm drawing={drawing} onCreated={select} />}
        />
        <OffMapBuildings buildings={offMap} onSelect={select} />
      </Panel>
      {selected !== undefined && (
        <BuildingPointsPanel
          key={selected.id}
          building={selected}
          onEditBuilding={
            onMap
              ? undefined
              : () => {
                  setEditing(true);
                }
          }
        />
      )}
      {selected !== undefined && (
        <BuildingEditDialog
          building={selected}
          open={editing}
          onOpenChange={setEditing}
          onRedraw={() => {
            setEditing(false);
            drawing.redraw(selected);
          }}
          onDeleted={() => {
            setEditing(false);
            select(null);
          }}
        />
      )}
    </Page>
  );
}
