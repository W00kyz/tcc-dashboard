import { AlertTriangle, ChevronDown, Clock, LocateFixed } from "lucide-react";
import { useState } from "react";

import {
  ROUTE_STATUS_LABEL_KEY,
  ROUTE_STATUS_TONE,
  toRouteStatus,
} from "@/components/board/routeStatus";
import { RouteActionsMenu } from "@/components/RouteActionsMenu";
import { RouteStopStrip } from "@/components/RouteStopStrip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";
import type { BoardRow, BoardRowGroup } from "@/lib/boardRows";
import { formatAge } from "@/lib/positionAge";
import { toStopStatus } from "@/lib/stopStatus";
import { cn } from "@/lib/utils";

// One column template shared by the header and every row, so cells line up across groups.
// Below lg the row reflows into a stacked layout instead of a horizontal scroll.
const ROW_GRID =
  "lg:grid lg:grid-cols-[minmax(10rem,1.2fr)_minmax(8.5rem,0.9fr)_minmax(14rem,1.5fr)_minmax(9rem,1.2fr)_7.5rem_7rem] lg:items-center lg:gap-4";

interface RouteBoardTableProps {
  groups: BoardRowGroup[];
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string) => void;
}

function HeaderRow() {
  const { t } = useTranslation();
  const columns = [
    t("boardColWorker"),
    t("boardColStatus"),
    t("boardColStops"),
    t("boardColNextStop"),
    t("boardColPosition"),
    t("boardColActions"),
  ];

  return (
    <div role="rowgroup" className="sr-only lg:not-sr-only">
      <div
        role="row"
        className={cn(
          "bg-card text-muted-foreground sticky top-14 z-[5] border-b px-4 py-2.5 text-[0.6875rem] font-bold tracking-[0.08em] uppercase",
          ROW_GRID,
        )}
      >
        {columns.map((column) => (
          <span key={column} role="columnheader">
            {column}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusCell({ row }: { row: BoardRow }) {
  const { t } = useTranslation();
  const status = toRouteStatus(row.route.status);
  const alertLabel =
    row.openAlertCount === 1
      ? t("routeBoardOpenAlertCountOne")
      : t("routeBoardOpenAlertCount").replace("{n}", String(row.openAlertCount));

  return (
    <div role="cell" className="flex flex-nowrap items-center gap-1">
      {row.isDelayed && (
        <Badge variant="late">
          <Clock aria-hidden="true" />
          {t("routeBoardDelayed")}
        </Badge>
      )}
      {row.openAlertCount > 0 && (
        // Compact so a delayed row keeps the table's row height: icon + count on screen, the
        // full phrase for assistive tech and on hover.
        <Badge variant="late" title={alertLabel}>
          <AlertTriangle aria-hidden="true" />
          <span aria-hidden="true">{row.openAlertCount}</span>
          <span className="sr-only">{alertLabel}</span>
        </Badge>
      )}
      {!row.isDelayed && (
        <Badge variant={ROUTE_STATUS_TONE[status]}>{t(ROUTE_STATUS_LABEL_KEY[status])}</Badge>
      )}
    </div>
  );
}

function NextStopCell({ row }: { row: BoardRow }) {
  const { t } = useTranslation();
  const next = row.route.stops.find((stop) => toStopStatus(stop.status) !== "DONE");
  const finished = ["DONE", "CANCELLED"].includes(row.route.status);

  return (
    <div role="cell" className="col-span-2 min-w-0 text-sm lg:col-span-1">
      <span className="text-muted-foreground mr-1 lg:hidden">{t("boardColNextStop")}:</span>
      {next && !finished ? (
        <span className="text-foreground font-semibold lg:block lg:truncate">
          {next.service_point_name}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  );
}

function PositionCell({ row, onLocate }: { row: BoardRow; onLocate: () => void }) {
  const { t } = useTranslation();
  if (row.position === null) {
    return (
      <div role="cell" className="text-muted-foreground text-sm">
        {t("boardNoPosition")}
      </div>
    );
  }
  const { latitude, longitude, age_seconds: age } = row.position;

  return (
    <div role="cell" className="flex items-center gap-1 text-sm">
      <span title={`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}>{formatAge(age, t)}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("workerPositionsLocate").replace("{name}", row.route.field_worker_name)}
        onClick={(event) => {
          event.stopPropagation();
          onLocate();
        }}
      >
        <LocateFixed aria-hidden="true" />
      </Button>
    </div>
  );
}

function BoardTableRow({
  row,
  selected,
  onSelect,
}: {
  row: BoardRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const status = toRouteStatus(row.route.status);
  const finished = status === "DONE" || status === "CANCELLED";

  return (
    <div
      role="row"
      aria-selected={selected}
      // Mouse convenience only: the locate button is the keyboard path to the same action.
      onClick={onSelect}
      className={cn(
        "grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-b px-4 py-3 transition-colors last:border-b-0 lg:py-2.5",
        ROW_GRID,
        row.isDelayed ? "bg-status-late-soft/50 hover:bg-status-late-soft" : "hover:bg-accent/60",
        selected && "bg-accent ring-primary/40 ring-2 ring-inset",
      )}
    >
      <div role="cell" className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "truncate font-semibold",
            status === "CANCELLED" ? "text-muted-foreground line-through" : "text-primary",
          )}
        >
          {row.route.field_worker_name}
        </span>
        {row.route.route_type === "OCCASIONAL" && (
          <Badge variant="plate" className="px-1.5">
            {t("routeBadgeOccasional")}
          </Badge>
        )}
      </div>
      <StatusCell row={row} />
      <div role="cell" className="col-span-2 flex items-center gap-2 lg:col-span-1">
        <RouteStopStrip
          size="sm"
          delayed={row.isDelayed}
          stops={row.route.stops.map((stop) => ({
            id: stop.id,
            orderIndex: stop.order_index,
            status: toStopStatus(stop.status),
          }))}
        />
        <span className="text-muted-foreground shrink-0 text-xs">
          {row.stopsDone}/{row.stopsTotal}
        </span>
      </div>
      <NextStopCell row={row} />
      <PositionCell row={row} onLocate={onSelect} />
      <div
        role="cell"
        className="flex justify-end"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {!finished && <RouteActionsMenu route={row.route} compact />}
      </div>
    </div>
  );
}

function GroupSummary({ group }: { group: BoardRowGroup }) {
  const { t } = useTranslation();
  const percent =
    group.stopsTotal === 0 ? null : Math.round((group.stopsDone / group.stopsTotal) * 100);
  const routes =
    group.routeCount === 1
      ? t("boardGroupRoutesOne")
      : t("boardGroupRoutes").replace("{n}", String(group.routeCount));

  return (
    <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm font-normal">
      <span>{routes}</span>
      {group.delayedCount > 0 && (
        <span className="text-status-late font-semibold">
          {"· "}
          {group.delayedCount === 1
            ? t("boardGroupDelayedOne")
            : t("boardGroupDelayed").replace("{n}", String(group.delayedCount))}
        </span>
      )}
      {percent !== null && (
        <span>
          {"· "}
          {t("boardGroupStops").replace("{n}", String(percent))}
        </span>
      )}
    </span>
  );
}

function CompanyGroup({ group, ...rest }: { group: BoardRowGroup } & RouteBoardTableProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const name = group.companyName ?? t("boardGroupNoCompany");
  const contentId = `board-group-${group.companyId ?? "none"}`;

  return (
    <div role="rowgroup" aria-label={name}>
      <div role="row" className="bg-muted/70 border-b">
        <div role="cell" className="px-2 py-1.5">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={() => {
              setOpen((value) => !value);
            }}
            className="hover:bg-accent flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-[4px] px-2 py-1 text-left"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn("size-4 shrink-0 transition-transform", !open && "-rotate-90")}
            />
            <span className="text-primary font-bold">{name}</span>
            <GroupSummary group={group} />
          </button>
        </div>
      </div>
      {open && (
        <div id={contentId}>
          {group.rows.map((row) => (
            <BoardTableRow
              key={row.route.id}
              row={row}
              selected={rest.selectedWorkerId === row.route.field_worker_id}
              onSelect={() => {
                rest.onSelectWorker(row.route.field_worker_id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Every route of the day as one dense row, grouped by contractor company, urgent first. */
export function RouteBoardTable(props: RouteBoardTableProps) {
  const { t } = useTranslation();

  return (
    <div role="table" aria-label={t("routeBoardRoutesLabel")} className="bg-card rounded-md border">
      <HeaderRow />
      {props.groups.map((group) => (
        <CompanyGroup key={group.companyId ?? "none"} group={group} {...props} />
      ))}
    </div>
  );
}
