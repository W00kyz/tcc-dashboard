import { Pencil } from "lucide-react";

import { type BuildingCounts, countsLine } from "@/components/buildings/useCampusBuildingMap";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";

interface BuildingSummaryCardProps {
  name: string;
  counts: BuildingCounts;
  onEdit: () => void;
}

/** The popup over a selected building: its name, how many floors and points, and the pencil
 * that opens its edit Dialog.
 * @example <BuildingSummaryCard name="Bloco CI" counts={{ floors: 2, points: 5 }} onEdit={o} /> */
export function BuildingSummaryCard({ name, counts, onEdit }: BuildingSummaryCardProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-foreground text-sm font-bold">{name}</p>
        <p className="text-muted-foreground text-xs">{countsLine(t, counts)}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("registryEditItem").replace("{name}", name)}
        onClick={onEdit}
      >
        <Pencil aria-hidden="true" />
      </Button>
    </div>
  );
}
