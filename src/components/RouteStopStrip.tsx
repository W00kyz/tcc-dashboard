import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { RELEASE_REASON_LABEL_KEY, type ReleaseReason } from "@/lib/releaseReason";
import type { StopStatus } from "@/lib/stopStatus";
import { cn } from "@/lib/utils";

/** The product's recurring motif, drawn as a wayfinding line: one numbered disc per
 * route_stop in route_stops.order_index order, joined by a track that fills in sign-blue
 * up to the last completed stop. A stop released back to the pool is greyed out and says why
 * (spec 2026-10-20-alocacao-automatica §8.2). */
export interface RouteStopStripStop {
  id: string;
  orderIndex: number;
  status: StopStatus;
  releaseReason?: ReleaseReason | null;
}

interface RouteStopStripProps {
  stops: RouteStopStripStop[];
  // "sm" fits a table row: 18px discs and 8px tracks, so eight stops take ~200px.
  size?: "default" | "sm";
}

const STATUS_LABEL_KEY: Record<StopStatus, StringKey> = {
  PENDING: "stopStatusPending",
  IN_PROGRESS: "stopStatusInProgress",
  DONE: "stopStatusDone",
  RELEASED: "stopStatusReleased",
};

const DISC_CLASS: Record<StopStatus, string> = {
  PENDING: "border-input bg-card text-muted-foreground",
  IN_PROGRESS: "border-primary bg-card text-primary ring-primary/25 ring-2",
  DONE: "border-primary bg-primary text-primary-foreground",
  RELEASED: "border-input bg-muted text-muted-foreground border-dashed opacity-60",
};

export function RouteStopStrip({ stops, size = "default" }: RouteStopStripProps) {
  const { t } = useTranslation();
  const small = size === "sm";
  if (stops.length === 0) {
    return null;
  }

  // "Liberado — Saiu do campus": the reason rides on the tooltip and the accessible name.
  const describe = (stop: RouteStopStripStop) => {
    const status = t(STATUS_LABEL_KEY[stop.status]);
    const reason = stop.status === "RELEASED" ? stop.releaseReason : null;

    return reason ? `${status} — ${t(RELEASE_REASON_LABEL_KEY[reason])}` : status;
  };

  return (
    <ol
      className="flex max-w-full items-center overflow-x-auto py-0.5"
      aria-label={t("routeStopStripLabel")}
    >
      {stops.map((stop, index) => (
        <li key={stop.id} className="flex shrink-0 items-center">
          <span
            role="img"
            aria-label={t("routeStopStripStop")
              .replace("{n}", String(stop.orderIndex))
              .replace("{status}", describe(stop))}
            title={describe(stop)}
            className={cn(
              "flex items-center justify-center rounded-full border-2 leading-none font-bold transition-colors duration-500 ease-out",
              small ? "size-[1.125rem] text-[0.5625rem]" : "size-6 text-[0.6875rem]",
              DISC_CLASS[stop.status],
            )}
          >
            {stop.orderIndex}
          </span>
          {index < stops.length - 1 && (
            <span
              aria-hidden="true"
              className={cn(
                "h-0.5 transition-colors duration-500 ease-out",
                small ? "w-2" : "w-5 sm:w-7",
                stop.status === "DONE" ? "bg-primary" : "bg-input",
              )}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
