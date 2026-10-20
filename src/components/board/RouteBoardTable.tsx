import { AlertTriangle, LocateFixed } from "lucide-react";

import {
  ROUTE_STATUS_LABEL_KEY,
  ROUTE_STATUS_TONE,
  toRouteStatus,
} from "@/components/board/routeStatus";
import { RouteStopStrip } from "@/components/RouteStopStrip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";
import type { BoardRow } from "@/lib/boardRows";
import { formatAge } from "@/lib/positionAge";
import { toStopStatus } from "@/lib/stopStatus";
import { cn } from "@/lib/utils";

// One column template shared by the header and every row, so cells line up.
// Below lg the row reflows into a stacked layout instead of a horizontal scroll.
const ROW_GRID =
  "lg:grid lg:grid-cols-[minmax(10rem,1.3fr)_minmax(8rem,1fr)_minmax(8.5rem,0.9fr)_minmax(14rem,1.6fr)_6rem] lg:items-center lg:gap-4";

interface RouteBoardTableProps {
  rows: BoardRow[];
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string) => void;
}

function HeaderRow() {
  const { t } = useTranslation();
  const columns = [
    t("boardColWorker"),
    t("boardColCompany"),
    t("boardColStatus"),
    t("boardColBatch"),
    t("boardColDoneToday"),
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

// The worker's name, and — when they reported a fix — the keyboard path to their marker.
function WorkerCell({ row, onLocate }: { row: BoardRow; onLocate: () => void }) {
  const { t } = useTranslation();

  return (
    <div role="cell" className="flex min-w-0 items-center gap-1">
      <span className="text-primary truncate font-semibold">{row.route.field_worker_name}</span>
      {row.position !== null && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("workerPositionsLocate").replace("{name}", row.route.field_worker_name)}
          title={formatAge(row.position.age_seconds, t)}
          onClick={(event) => {
            event.stopPropagation();
            onLocate();
          }}
        >
          <LocateFixed aria-hidden="true" />
        </Button>
      )}
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
      <Badge variant={ROUTE_STATUS_TONE[status]}>{t(ROUTE_STATUS_LABEL_KEY[status])}</Badge>
      {row.openAlertCount > 0 && (
        // Compact so the row keeps the table's height: icon + count on screen, the full phrase
        // for assistive tech and on hover.
        <Badge variant="late" title={alertLabel}>
          <AlertTriangle aria-hidden="true" />
          <span aria-hidden="true">{row.openAlertCount}</span>
          <span className="sr-only">{alertLabel}</span>
        </Badge>
      )}
    </div>
  );
}

function BatchCell({ row }: { row: BoardRow }) {
  const { t } = useTranslation();

  return (
    <div role="cell" className="col-span-2 flex items-center gap-2 lg:col-span-1">
      {row.route.current_batch > 0 && (
        <span className="text-muted-foreground shrink-0 text-xs">
          {t("boardBatchNumber").replace("{n}", String(row.route.current_batch))}
        </span>
      )}
      <RouteStopStrip
        size="sm"
        stops={row.currentBatch.map((stop) => ({
          id: stop.id,
          orderIndex: stop.order_index,
          status: toStopStatus(stop.status),
          releaseReason: stop.release_reason,
        }))}
      />
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

  return (
    <div
      role="row"
      aria-selected={selected}
      // Mouse convenience only: the locate button is the keyboard path to the same action.
      onClick={onSelect}
      className={cn(
        "hover:bg-accent/60 grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-b px-4 py-3 transition-colors last:border-b-0 lg:py-2.5",
        ROW_GRID,
        selected && "bg-accent ring-primary/40 ring-2 ring-inset",
      )}
    >
      <WorkerCell row={row} onLocate={onSelect} />
      <div role="cell" className="text-muted-foreground truncate text-sm">
        {row.companyName ?? t("boardNoCompany")}
      </div>
      <StatusCell row={row} />
      <BatchCell row={row} />
      <div role="cell" className="text-sm font-semibold lg:text-right">
        <span className="text-muted-foreground font-normal lg:hidden">
          {t("boardColDoneToday")}:{" "}
        </span>
        {row.doneToday}
      </div>
    </div>
  );
}

/** Every route of the day as one dense row, urgent first (spec 2026-10-20 §8.2). */
export function RouteBoardTable({ rows, selectedWorkerId, onSelectWorker }: RouteBoardTableProps) {
  const { t } = useTranslation();

  return (
    <div role="table" aria-label={t("routeBoardRoutesLabel")} className="bg-card rounded-md border">
      <HeaderRow />
      <div role="rowgroup">
        {rows.map((row) => (
          <BoardTableRow
            key={row.route.id}
            row={row}
            selected={selectedWorkerId === row.route.field_worker_id}
            onSelect={() => {
              onSelectWorker(row.route.field_worker_id);
            }}
          />
        ))}
      </div>
    </div>
  );
}
