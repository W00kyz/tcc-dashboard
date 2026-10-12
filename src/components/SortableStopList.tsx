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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { GripVertical, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/layout/StateMessages";
import { RouteStopStrip } from "@/components/RouteStopStrip";

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

const TIME_INPUT_CLASS =
  "border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-[6.5rem] rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]";

interface SortableStopRowProps {
  stop: StopDraft;
  position: number;
  serviceTypes?: ServiceTypeOption[];
  onRemove: (key: string) => void;
  onEditWindow: (key: string, field: "from" | "to", value: string) => void;
  onEditServiceType?: (key: string, serviceTypeId: string) => void;
}

function SortableStopRow({
  stop,
  position,
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
      className="bg-card relative flex flex-wrap items-center gap-2 py-2.5 sm:flex-nowrap"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* The handle is the drag activator for both sensors: PointerSensor for mouse/touch,
          KeyboardSensor for Space-to-grab, Arrow-to-move, Space-to-drop. dnd-kit owns the
          keydown handling and the live-region announcements via `listeners`. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={t("routeBuilderDragHandle")}
        className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      {/* The stop's place on the route, in the board's disc grammar. */}
      <span
        aria-hidden="true"
        className="border-primary bg-card text-primary flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[0.6875rem] font-bold"
      >
        {position}
      </span>
      <span className="text-foreground min-w-0 flex-1 font-semibold">{stop.servicePointName}</span>
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
        <NativeSelect
          size="sm"
          wrapperClassName="w-44 shrink-0"
          aria-label={t("routeBuilderServiceType")}
          value={stop.serviceTypeId}
          onChange={(event) => {
            onEditServiceType(stop.key, event.target.value);
          }}
        >
          <NativeSelectOption value="">{t("routeBuilderServiceTypeNone")}</NativeSelectOption>
          {(serviceTypes ?? []).map((serviceType) => (
            <NativeSelectOption key={serviceType.id} value={serviceType.id}>
              {serviceType.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      <button
        type="button"
        aria-label={t("routeBuilderRemoveStop")}
        className="text-muted-foreground hover:bg-status-late-soft hover:text-status-late flex size-8 shrink-0 items-center justify-center rounded-md"
        onClick={() => {
          onRemove(stop.key);
        }}
      >
        <Trash2 aria-hidden="true" className="size-4" />
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
    return <EmptyState>{t("routeBuilderEmpty")}</EmptyState>;
  }

  return (
    <div className="space-y-3">
      {/* The planned route drawn in the board's wayfinding line, redrawn as stops are
       * added or reordered below. */}
      <RouteStopStrip
        stops={stops.map((stop, index) => ({
          id: stop.key,
          orderIndex: index + 1,
          status: "PENDING" as const,
        }))}
      />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={stops.map((stop) => stop.key)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="divide-y">
            {stops.map((stop, index) => (
              <SortableStopRow
                key={stop.key}
                stop={stop}
                position={index + 1}
                serviceTypes={serviceTypes}
                onRemove={onRemove}
                onEditWindow={onEditWindow}
                onEditServiceType={onEditServiceType}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </div>
  );
}
