import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";

import type { components } from "@/api/generated/schema";
import { EmptyState, ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { type PointVisitStatus, summarisePoints } from "@/lib/buildingInterior";
import { cn } from "@/lib/utils";

type FloorOut = components["schemas"]["FloorOut"];
type PanelPoint = Pick<
  components["schemas"]["ServicePointOut"],
  "id" | "floor_id" | "name" | "latitude" | "longitude"
> & { description?: string };
// A floor id, or "all" for every floor of the building.
type FloorChoice = string;
type Translate = (key: StringKey) => string;

const STATUS_BADGE: Record<PointVisitStatus, { label: StringKey; tone: BadgeTone | "outline" }> = {
  LATE: { label: "pointStatusLate", tone: "late" },
  IN_PROGRESS: { label: "pointStatusInProgress", tone: "progress" },
  PENDING: { label: "pointStatusPending", tone: "pending" },
  DONE: { label: "pointStatusDone", tone: "done" },
  NOT_SCHEDULED: { label: "pointStatusNotScheduled", tone: "outline" },
};

export interface BuildingPanelProps {
  building: { id: string; name: string; campusArea: string };
  floors: FloorOut[] | undefined;
  pointsByFloor: Map<string, PanelPoint[]>;
  statuses: Map<string, PointVisitStatus>;
  selectedFloorId: FloorChoice;
  onSelectFloor: (floorId: FloorChoice) => void;
  selectedPointId: string | null;
  onSelectPoint: (pointId: string) => void;
  onClose: () => void;
  isLoading: boolean;
  isError: boolean;
}

interface PanelHeaderProps {
  building: BuildingPanelProps["building"];
  /** Undefined while floors are loading or failed: a summary of zeros would be a lie. */
  statuses: PointVisitStatus[] | undefined;
  onClose: () => void;
}

function plural(t: Translate, count: number, many: StringKey, one: StringKey): string {
  return count === 1 ? t(one) : t(many).replace("{n}", String(count));
}

function summaryLine(t: Translate, statuses: PointVisitStatus[]): string {
  const { total, done, late } = summarisePoints(statuses);

  return [
    plural(t, total, "buildingPanelPoints", "buildingPanelPointsOne"),
    plural(t, done, "buildingPanelDone", "buildingPanelDoneOne"),
    plural(t, late, "buildingPanelLate", "buildingPanelLateOne"),
  ].join(" · ");
}

function statusOf(statuses: Map<string, PointVisitStatus>, pointId: string): PointVisitStatus {
  return statuses.get(pointId) ?? "NOT_SCHEDULED";
}

function pointsToShow(props: BuildingPanelProps): PanelPoint[] {
  const { floors, pointsByFloor, selectedFloorId } = props;
  const shown = (floors ?? []).filter(
    (floor) => selectedFloorId === "all" || floor.id === selectedFloorId,
  );

  return shown.flatMap((floor) => pointsByFloor.get(floor.id) ?? []);
}

function FloorTabs(props: BuildingPanelProps) {
  const { t } = useTranslation();
  const tabs = [{ id: "all", label: t("buildingPanelAllFloors") }, ...(props.floors ?? [])];

  return (
    <div role="tablist" aria-label={t("buildingPanelFloorsLabel")} className="flex flex-wrap gap-1">
      {tabs.map((tab) => (
        <FloorTab
          key={tab.id}
          {...tab}
          selected={props.selectedFloorId === tab.id}
          onSelect={props.onSelectFloor}
        />
      ))}
    </div>
  );
}

function FloorTab(props: {
  id: string;
  label: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Button
      type="button"
      role="tab"
      size="sm"
      variant={props.selected ? "default" : "outline"}
      aria-selected={props.selected}
      onClick={() => {
        props.onSelect(props.id);
      }}
    >
      {props.label}
    </Button>
  );
}

// Under "Todos" the floor says where the point is; the description says what it is.
function pointDetails(point: PanelPoint, props: BuildingPanelProps): string {
  const floor = props.floors?.find((candidate) => candidate.id === point.floor_id)?.label;
  const parts = [props.selectedFloorId === "all" ? floor : undefined, point.description];

  return parts.filter((part) => part !== undefined && part !== "").join(" · ");
}

function PointItem({ point, ...props }: { point: PanelPoint } & BuildingPanelProps) {
  const { t } = useTranslation();
  const badge = STATUS_BADGE[statusOf(props.statuses, point.id)];
  const selected = props.selectedPointId === point.id;
  const details = pointDetails(point, props);

  return (
    <li
      aria-labelledby={`building-point-${point.id}`}
      className={cn("flex items-center justify-between gap-2 px-4 py-2", selected && "bg-muted")}
    >
      <span className="min-w-0">
        <PointButton point={point} onSelect={props.onSelectPoint} />
        {details !== "" && <span className="text-muted-foreground block text-xs">{details}</span>}
      </span>
      <Badge variant={badge.tone}>{t(badge.label)}</Badge>
    </li>
  );
}

function PointButton(props: { point: PanelPoint; onSelect: (pointId: string) => void }) {
  return (
    <button
      id={`building-point-${props.point.id}`}
      type="button"
      className="text-left text-sm font-medium hover:underline"
      onClick={() => {
        props.onSelect(props.point.id);
      }}
    >
      {props.point.name}
    </button>
  );
}

function PointList(props: BuildingPanelProps) {
  const { t } = useTranslation();
  const points = pointsToShow(props);
  if (points.length === 0) {
    return <EmptyState>{t("buildingPanelNoPoints")}</EmptyState>;
  }

  return (
    <ul className="divide-y">
      {points.map((point) => (
        <PointItem key={point.id} point={point} {...props} />
      ))}
    </ul>
  );
}

function PanelBody(props: BuildingPanelProps) {
  const { t } = useTranslation();
  if (props.isError) {
    return <ErrorMessage>{t("buildingPanelError")}</ErrorMessage>;
  }
  if (props.isLoading || props.floors === undefined) {
    return <LoadingMessage>{t("buildingPanelLoading")}</LoadingMessage>;
  }
  if (props.floors.length === 0) {
    return <EmptyState>{t("buildingPanelNoFloors")}</EmptyState>;
  }

  return (
    <div className="space-y-3">
      <FloorTabs {...props} />
      <PointList {...props} />
    </div>
  );
}

// Escape is a document-level shortcut so it works wherever focus is, e.g. after a map click.
function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      // Radix menus/dialogs consume their own Escape with preventDefault; closing the panel as
      // well would drop the building when the manager only meant to dismiss a menu.
      if (event.key === "Escape" && !event.defaultPrevented) {
        onEscape();
      }
    }
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onEscape]);
}

function PanelHeader({ building, statuses, onClose }: PanelHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="space-y-1 border-b px-4 py-3">
      <Button type="button" variant="ghost" size="sm" onClick={onClose}>
        <ChevronLeft aria-hidden="true" />
        {t("buildingPanelBack")}
      </Button>
      <h2 id="building-panel-heading" className="text-primary text-base font-bold">
        {building.name}
      </h2>
      <p className="text-muted-foreground text-sm">{building.campusArea}</p>
      {statuses && <p className="text-sm font-medium">{summaryLine(t, statuses)}</p>}
      <Button variant="link" size="sm" className="h-auto px-0" asChild>
        <Link to={`/predios?predio=${building.id}`}>
          {t("buildingPanelOpenRegistry")}
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
    </header>
  );
}

/** Replaces the alert rail while a building is open: its floors and today's status per point.
 * @example <BuildingPanel building={...} floors={floors} statuses={statuses} ... /> */
export function BuildingPanel(props: BuildingPanelProps) {
  useEscapeKey(props.onClose);
  const ready = props.floors !== undefined && !props.isError;
  const visitStatuses = pointsToShow({ ...props, selectedFloorId: "all" }).map((point) =>
    statusOf(props.statuses, point.id),
  );

  return (
    <section aria-labelledby="building-panel-heading" className="bg-card rounded-md border">
      <PanelHeader
        building={props.building}
        statuses={ready ? visitStatuses : undefined}
        onClose={props.onClose}
      />
      <div className="p-4">
        <PanelBody {...props} />
      </div>
    </section>
  );
}
