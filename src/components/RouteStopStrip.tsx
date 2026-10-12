import { cn } from "@/lib/utils";

/** The product's recurring motif, drawn as a wayfinding line: one numbered disc per
 * route_stop in route_stops.order_index order, joined by a track that fills in sign-blue
 * up to the last completed stop. Stages 5/8/9 reuse this component as more statuses
 * (LATE) join the three this stage knows about. */
export type RouteStopUiStatus = "PENDING" | "IN_PROGRESS" | "DONE";

interface RouteStopStripProps {
  stops: { id: string; orderIndex: number; status: RouteStopUiStatus }[];
  // The route is running late: the stop the worker is on (the first not yet done) is
  // marked red. The route card also says "Atrasada" in words; the disc is the locator.
  delayed?: boolean;
  // "sm" fits a table row: 18px discs and 8px tracks, so eight stops take ~200px.
  size?: "default" | "sm";
}

const STATUS_LABEL: Record<RouteStopUiStatus, string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluído",
};

const DISC_CLASS: Record<RouteStopUiStatus, string> = {
  PENDING: "border-input bg-card text-muted-foreground",
  IN_PROGRESS: "border-primary bg-card text-primary ring-primary/25 ring-2",
  DONE: "border-primary bg-primary text-primary-foreground",
};

const LATE_DISC_CLASS = "border-status-late bg-status-late text-white";

function currentStopId(stops: RouteStopStripProps["stops"]): string | undefined {
  return stops.find((stop) => stop.status !== "DONE")?.id;
}

export function RouteStopStrip({ stops, delayed = false, size = "default" }: RouteStopStripProps) {
  const small = size === "sm";
  if (stops.length === 0) {
    return null;
  }

  const lateStopId = delayed ? currentStopId(stops) : undefined;

  return (
    <ol
      className="flex max-w-full items-center overflow-x-auto py-0.5"
      aria-label="Sequência de pontos da rota"
    >
      {stops.map((stop, index) => (
        <li key={stop.id} className="flex shrink-0 items-center">
          <span
            role="img"
            aria-label={`Ponto ${String(stop.orderIndex)}: ${STATUS_LABEL[stop.status]}`}
            title={STATUS_LABEL[stop.status]}
            className={cn(
              "flex items-center justify-center rounded-full border-2 leading-none font-bold transition-colors duration-500 ease-out",
              small ? "size-[1.125rem] text-[0.5625rem]" : "size-6 text-[0.6875rem]",
              stop.id === lateStopId ? LATE_DISC_CLASS : DISC_CLASS[stop.status],
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
