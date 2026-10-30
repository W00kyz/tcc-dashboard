import { MapPin, Pencil, SquareDashed } from "lucide-react";
import { useState } from "react";

import type { components } from "@/api/generated/schema";
import { BuildingEditDialog } from "@/components/buildings/BuildingEditDialog";
import { BuildingSummaryCard } from "@/components/buildings/BuildingSummaryCard";
import { CampusBuildingsMap } from "@/components/buildings/CampusBuildingsMap";
import { EditPlaceDialog } from "@/components/buildings/EditPlaceDialog";
import { NewBuildingForm } from "@/components/buildings/NewBuildingForm";
import { NewPlaceDialog } from "@/components/buildings/NewPlaceDialog";
import { PlaceSummaryCard } from "@/components/buildings/PlaceSummaryCard";
import { OutsideCampusError } from "@/components/buildings/placeErrors";
import { RedrawOutlineForm } from "@/components/buildings/RedrawOutlineForm";
import { useCampusBuildingMap } from "@/components/buildings/useCampusBuildingMap";
import { useCampusPlaces } from "@/components/buildings/useCampusPlaces";
import { useMapSelection } from "@/components/buildings/useMapSelection";
import { useMovePlace } from "@/components/buildings/useMovePlace";
import { type PinPosition, usePlacePinning } from "@/components/buildings/usePlacePinning";
import { Page, PageHeader, Panel } from "@/components/layout/Page";
import { Field } from "@/components/layout/Registry";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/useTranslation";
import type { GeoPolygon } from "@/lib/osmBuildings";

type BuildingOut = components["schemas"]["BuildingOut"];

const byName = (a: BuildingOut, b: BuildingOut) => a.name.localeCompare(b.name, "pt-BR");

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

type Pinning = ReturnType<typeof usePlacePinning>;

function toolHint(t: ReturnType<typeof useTranslation>["t"], drawing: Drawing, pin: Pinning) {
  if (pin.movingPlaceId !== null) {
    return t("placesMoveHint");
  }
  if (pin.pinning) {
    return t("placesPinHint");
  }
  if (drawing.redrawFor !== null) {
    return t("redrawHint").replace("{name}", drawing.redrawFor.name);
  }

  return t(drawing.drawing ? "buildingsDrawingHint" : "buildingsMapHint");
}

/** A building without an outline has no card on the map to open its edit Dialog from. */
function OffMapEditBar(props: { building: BuildingOut; onEdit: () => void }) {
  const { t } = useTranslation();
  const { building } = props;

  return (
    <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
      <span className="text-foreground text-sm font-semibold">{building.name}</span>
      <Button
        type="button"
        variant="outline"
        aria-label={t("registryEditItem").replace("{name}", building.name)}
        onClick={props.onEdit}
      >
        <Pencil aria-hidden="true" />
        {t("registryEdit")}
      </Button>
    </Panel>
  );
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
 * the pencil to its edit Dialog, where its floors and rooms are managed); drawing a rectangle
 * registers a new one. All creating and editing happens in Dialogs and map popups. */
export function BuildingsPage() {
  const { t } = useTranslation();
  const { buildingId: selectedId, placeId, selectBuilding, selectPlace } = useMapSelection();
  const { buildings, mapBuildings, offMap, countsOf } = useCampusBuildingMap();
  const { places, servicesOf } = useCampusPlaces();
  const drawing = useRectangleDrawing();
  const pin = usePlacePinning();
  const move = useMovePlace();
  const [editing, setEditing] = useState(false);
  const [editingPlace, setEditingPlace] = useState(false);
  const selected = buildings.find((building) => building.id === selectedId);
  const onMap = mapBuildings.some((building) => building.id === selectedId);
  const selectedPlace = places.find((place) => place.id === placeId);
  const busyDrawing = drawing.drawing || drawing.draft !== null;
  // Choosing anything on the map ends the pin tool: the click was meant for the selection.
  const select = (buildingId: string | null) => {
    pin.stop();
    move.reset();
    selectBuilding(buildingId);
  };
  const selectPlaceOnMap = (id: string | null) => {
    pin.stop();
    move.reset();
    selectPlace(id);
  };
  // The pin tool is on for one click: a new place's Dialog, or the new position of `movingPlaceId`.
  const onPinned = (position: PinPosition) => {
    const movingId = pin.movingPlaceId;
    if (movingId === null) {
      pin.place(position);

      return;
    }
    // The tool ends on the click either way; a refusal (outside the campus) shows below the hint.
    pin.stop();
    move.mutate({ placeId: movingId, position });
  };

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
              pin.stop();
              select(null);
              drawing.toggle();
            }}
          >
            <SquareDashed aria-hidden="true" />
            {t(drawing.drawing ? "buildingsDrawingStop" : "buildingsDrawRectangle")}
          </Button>
          <Button
            type="button"
            aria-pressed={pin.pinning && pin.movingPlaceId === null}
            onClick={() => {
              drawing.stop();
              move.reset();
              if (!pin.pinning) {
                selectPlace(null);
              }
              pin.toggle();
            }}
          >
            <MapPin aria-hidden="true" />
            {t("placesPinTool")}
          </Button>
        </div>
        <p aria-live="polite" className="text-muted-foreground px-1 text-sm">
          {toolHint(t, drawing, pin)}
        </p>
        {move.isError && (
          <ErrorMessage>
            {t(
              move.error instanceof OutsideCampusError ? "placesOutsideCampus" : "placesSaveError",
            )}
          </ErrorMessage>
        )}
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
          places={places}
          selectedPlaceId={placeId}
          onSelectPlace={selectPlaceOnMap}
          selectedPlaceCard={
            selectedPlace === undefined || busyDrawing ? undefined : (
              <PlaceSummaryCard
                name={selectedPlace.name}
                servicesCount={servicesOf(selectedPlace.id)}
                onEdit={() => {
                  setEditingPlace(true);
                }}
              />
            )
          }
          pinning={pin.pinning}
          onPinned={onPinned}
          onExitPinning={pin.stop}
          draftPin={pin.draft}
        />
        <OffMapBuildings buildings={offMap} onSelect={select} />
      </Panel>
      {pin.draft !== null && (
        <NewPlaceDialog position={pin.draft} onClose={pin.discard} onCreated={selectPlaceOnMap} />
      )}
      {selectedPlace !== undefined && (
        <EditPlaceDialog
          place={selectedPlace}
          open={editingPlace}
          onOpenChange={setEditingPlace}
          onMove={() => {
            drawing.stop();
            move.reset();
            pin.startMove(selectedPlace.id);
          }}
          onDeleted={() => {
            selectPlaceOnMap(null);
          }}
        />
      )}
      {selected !== undefined && !onMap && (
        <OffMapEditBar
          building={selected}
          onEdit={() => {
            setEditing(true);
          }}
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
