import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useTranslation } from "@/i18n/useTranslation";

/** One planned stop on the route builder screen, before it is turned into a `StopBody`.
 * `key` is a client-only id (crypto.randomUUID) so dnd-kit and React have a stable
 * handle even while `servicePointId` repeats or the row has no server id yet. */
export interface StopDraft {
  key: string;
  servicePointId: string;
  servicePointName: string;
  expectedArrivalFrom: string;
  expectedArrivalTo: string;
  serviceTypeId: string;
}

/** One selectable option for the per-stop service-type `<select>`. */
export interface ServiceTypeOption {
  id: string;
  name: string;
}

interface SortableStopListProps {
  stops: StopDraft[];
  // Optional: only the route builder (Task 8) offers a service-type picker per stop. Route
  // templates render this list too but have no such concept, so they pass neither and the
  // row skips the select entirely rather than showing one that does nothing.
  serviceTypes?: ServiceTypeOption[];
  onReorder: (next: StopDraft[]) => void;
  onRemove: (key: string) => void;
  onEditWindow: (key: string, field: "from" | "to", value: string) => void;
  onEditServiceType?: (key: string, serviceTypeId: string) => void;
}

const TIME_INPUT_CLASS = "border-input h-8 rounded-md border bg-transparent px-2 text-sm";
const SERVICE_TYPE_SELECT_CLASS = "border-input h-8 rounded-md border bg-transparent px-2 text-sm";

interface SortableStopRowProps {
  stop: StopDraft;
  serviceTypes?: ServiceTypeOption[];
  onRemove: (key: string) => void;
  onEditWindow: (key: string, field: "from" | "to", value: string) => void;
  onEditServiceType?: (key: string, serviceTypeId: string) => void;
}

function SortableStopRow({
  stop,
  serviceTypes,
  onRemove,
  onEditWindow,
  onEditServiceType,
}: SortableStopRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: stop.key });

  return (
    <li
      ref={setNodeRef}
      className="flex items-center gap-2 py-2"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* The handle is the drag activator for both sensors: PointerSensor for mouse/touch,
          KeyboardSensor for Space-to-grab, Arrow-to-move, Space-to-drop. dnd-kit owns the
          keydown handling and the live-region announcements via `listeners`. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={t("routeBuilderDragHandle")}
        className="cursor-grab px-2 text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <span className="flex-1 font-medium">{stop.servicePointName}</span>
      <input
        type="time"
        aria-label={t("routeBuilderArrivalFrom")}
        className={TIME_INPUT_CLASS}
        value={stop.expectedArrivalFrom}
        onChange={(event) => {
          onEditWindow(stop.key, "from", event.target.value);
        }}
      />
      <input
        type="time"
        aria-label={t("routeBuilderArrivalTo")}
        className={TIME_INPUT_CLASS}
        value={stop.expectedArrivalTo}
        onChange={(event) => {
          onEditWindow(stop.key, "to", event.target.value);
        }}
      />
      {onEditServiceType !== undefined && (
        <select
          aria-label={t("routeBuilderServiceType")}
          className={SERVICE_TYPE_SELECT_CLASS}
          value={stop.serviceTypeId}
          onChange={(event) => {
            onEditServiceType(stop.key, event.target.value);
          }}
        >
          <option value="">{t("routeBuilderServiceTypeNone")}</option>
          {(serviceTypes ?? []).map((serviceType) => (
            <option key={serviceType.id} value={serviceType.id}>
              {serviceType.name}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        aria-label={t("routeBuilderRemoveStop")}
        className="px-2 text-destructive"
        onClick={() => {
          onRemove(stop.key);
        }}
      >
        ×
      </button>
    </li>
  );
}

export function SortableStopList({
  stops,
  serviceTypes,
  onReorder,
  onRemove,
  onEditWindow,
  onEditServiceType,
}: SortableStopListProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over === null || active.id === over.id) {
      return;
    }
    const from = stops.findIndex((stop) => stop.key === active.id);
    const to = stops.findIndex((stop) => stop.key === over.id);
    onReorder(arrayMove(stops, from, to));
  }

  if (stops.length === 0) {
    return <p className="text-muted-foreground">{t("routeBuilderEmpty")}</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={stops.map((stop) => stop.key)} strategy={verticalListSortingStrategy}>
        <ol className="divide-border divide-y">
          {stops.map((stop) => (
            <SortableStopRow
              key={stop.key}
              stop={stop}
              serviceTypes={serviceTypes}
              onRemove={onRemove}
              onEditWindow={onEditWindow}
              onEditServiceType={onEditServiceType}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
