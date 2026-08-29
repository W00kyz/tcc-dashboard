/** The product's recurring motif: one dot per route_stop, colored by status, in
 * route_stops.order_index order. Stages 4/5/8/9 reuse this component as more statuses
 * (IN_PROGRESS, LATE) join the two this stage knows about. */
export type RouteStopUiStatus = "PENDING" | "DONE";

interface RouteStopStripProps {
  stops: { id: string; orderIndex: number; status: RouteStopUiStatus }[];
}

const STATUS_LABEL: Record<RouteStopUiStatus, string> = {
  PENDING: "Pendente",
  DONE: "Concluído",
};

const STATUS_COLOR_VAR: Record<RouteStopUiStatus, string> = {
  PENDING: "var(--color-status-pending)",
  DONE: "var(--color-status-done)",
};

export function RouteStopStrip({ stops }: RouteStopStripProps) {
  if (stops.length === 0) {
    return null;
  }

  return (
    <ol className="flex items-center gap-1" aria-label="Sequência de pontos da rota">
      {stops.map((stop, index) => (
        <li key={stop.id} className="flex items-center gap-1">
          <span
            role="img"
            aria-label={`Ponto ${String(stop.orderIndex)}: ${STATUS_LABEL[stop.status]}`}
            title={STATUS_LABEL[stop.status]}
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: STATUS_COLOR_VAR[stop.status] }}
          />
          {index < stops.length - 1 && <span className="h-px w-4 bg-border" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}
