import type { components } from "@/api/generated/schema";
import type { MapBuilding } from "@/components/board/BuildingsLayer";
import { WorkerPositionsMap } from "@/components/WorkerPositionsMap";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { cn } from "@/lib/utils";

type BoardPosition = components["schemas"]["BoardPosition"];

const LEGEND: { key: StringKey; swatch: string }[] = [
  { key: "boardMapLegendLive", swatch: "bg-primary" },
  { key: "boardMapLegendStale", swatch: "bg-muted border-status-pending border-2" },
  { key: "boardMapLegendBuilding", swatch: "bg-primary/15 border-primary rounded-[2px] border" },
];

interface OperationsMapPanelProps {
  positions: BoardPosition[];
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string) => void;
  buildings?: MapBuilding[];
  selectedBuildingId?: string | null;
  onSelectBuilding?: (buildingId: string | null) => void;
}

/** The board's centrepiece: where every worker is right now, and the campus buildings. */
export function OperationsMapPanel({
  positions,
  selectedWorkerId,
  onSelectWorker,
  buildings,
  selectedBuildingId,
  onSelectBuilding,
}: OperationsMapPanelProps) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="operations-map-heading" className="bg-card rounded-md border">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2
            id="operations-map-heading"
            className="text-primary text-base font-bold whitespace-nowrap"
          >
            {t("boardMapTitle")}
          </h2>
          <span className="text-muted-foreground text-sm">
            {positions.length === 1
              ? t("boardMapWorkersInFieldOne")
              : t("boardMapWorkersInField").replace("{n}", String(positions.length))}
          </span>
        </div>
        <ul aria-label={t("boardMapLegendLabel")} className="flex flex-wrap gap-x-4 gap-y-1">
          {LEGEND.map((item) => (
            <li key={item.key} className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span aria-hidden="true" className={cn("size-2.5 rounded-full", item.swatch)} />
              {t(item.key)}
            </li>
          ))}
        </ul>
      </div>
      <div className="p-2">
        <WorkerPositionsMap
          positions={positions}
          selectedWorkerId={selectedWorkerId}
          onSelectWorker={onSelectWorker}
          buildings={buildings}
          selectedBuildingId={selectedBuildingId}
          onSelectBuilding={onSelectBuilding}
          className="h-[min(62vh,40rem)] min-h-[22rem] rounded-[4px] border-0"
        />
        <p className="text-muted-foreground px-1 pt-2 text-xs">
          {t("boardMapBuildingsHiddenHint")}
        </p>
      </div>
    </section>
  );
}
