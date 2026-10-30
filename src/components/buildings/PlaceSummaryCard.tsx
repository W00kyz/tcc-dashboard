import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";

interface PlaceSummaryCardProps {
  name: string;
  servicesCount: number;
  /** Opens the place's edit Dialog. Without it the card is read-only: no pencil. */
  onEdit?: () => void;
}

/** The popup over a selected pin: the place's name, how many services it has and, when it can be
 * edited, the pencil.
 * @example <PlaceSummaryCard name="Ponto de ônibus" servicesCount={2} onEdit={open} /> */
export function PlaceSummaryCard({ name, servicesCount, onEdit }: PlaceSummaryCardProps) {
  const { t } = useTranslation();
  const count =
    servicesCount === 1
      ? t("placesServicesCountOne")
      : t("placesServicesCount").replace("{n}", String(servicesCount));

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-foreground text-sm font-bold">{name}</p>
        <p className="text-muted-foreground text-xs">{count}</p>
      </div>
      {onEdit !== undefined && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("registryEditItem").replace("{name}", name)}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
