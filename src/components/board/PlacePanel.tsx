import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import type { components } from "@/api/generated/schema";
import { STATUS_BADGE } from "@/components/board/pointStatusBadge";
import { useEscapeKey } from "@/components/board/useEscapeKey";
import { EmptyState, ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { type PointVisitStatus, summarisePoints } from "@/lib/buildingInterior";

type PanelService = Pick<
  components["schemas"]["ServicePointOut"],
  "id" | "name" | "description" | "service_type_name" | "active"
>;
type Translate = (key: StringKey) => string;

export interface PlacePanelProps {
  place: { id: string; name: string };
  /** Undefined while the points load or failed: a summary of zeros would be a lie. */
  points: PanelService[] | undefined;
  statuses: Map<string, PointVisitStatus>;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
}

function statusOf(statuses: Map<string, PointVisitStatus>, pointId: string): PointVisitStatus {
  return statuses.get(pointId) ?? "NOT_SCHEDULED";
}

function plural(t: Translate, count: number, many: StringKey, one: StringKey): string {
  return count === 1 ? t(one) : t(many).replace("{n}", String(count));
}

function summaryLine(t: Translate, statuses: PointVisitStatus[]): string {
  const { total, done } = summarisePoints(statuses);

  return [
    plural(t, total, "placesServicesCount", "placesServicesCountOne"),
    plural(t, done, "buildingPanelDone", "buildingPanelDoneOne"),
  ].join(" · ");
}

// A place's service is named by its type ("Limpeza"); the point's own name is the fallback.
function serviceTitle(service: PanelService): string {
  return service.service_type_name ?? service.name;
}

function ServiceItem(props: { service: PanelService; status: PointVisitStatus }) {
  const { t } = useTranslation();
  const { service } = props;
  const badge = STATUS_BADGE[props.status];

  return (
    <li
      aria-labelledby={`place-service-${service.id}`}
      className="flex items-center justify-between gap-2 px-4 py-2"
    >
      <span className="min-w-0">
        <span id={`place-service-${service.id}`} className="text-sm font-medium">
          {serviceTitle(service)}
        </span>
        {service.description !== "" && (
          <span className="text-muted-foreground block text-xs">{service.description}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {!service.active && <Badge variant="outline">{t("placePanelInactive")}</Badge>}
        <Badge variant={badge.tone}>{t(badge.label)}</Badge>
      </span>
    </li>
  );
}

function PanelBody(props: PlacePanelProps) {
  const { t } = useTranslation();
  if (props.isError) {
    return <ErrorMessage>{t("placePanelError")}</ErrorMessage>;
  }
  if (props.isLoading || props.points === undefined) {
    return <LoadingMessage>{t("placePanelLoading")}</LoadingMessage>;
  }
  if (props.points.length === 0) {
    return <EmptyState>{t("placePanelNoServices")}</EmptyState>;
  }

  return (
    <ul className="divide-y">
      {props.points.map((service) => (
        <ServiceItem
          key={service.id}
          service={service}
          status={statusOf(props.statuses, service.id)}
        />
      ))}
    </ul>
  );
}

function PanelHeader(props: PlacePanelProps) {
  const { t } = useTranslation();
  const ready = props.points !== undefined && !props.isError;
  const visits = (props.points ?? []).map((point) => statusOf(props.statuses, point.id));

  return (
    <header className="space-y-1 border-b px-4 py-3">
      <Button type="button" variant="ghost" size="sm" onClick={props.onClose}>
        <ChevronLeft aria-hidden="true" />
        {t("buildingPanelBack")}
      </Button>
      <h2 id="place-panel-heading" className="text-primary text-base font-bold">
        {props.place.name}
      </h2>
      {ready && <p className="text-sm font-medium">{summaryLine(t, visits)}</p>}
      <Button variant="link" size="sm" className="h-auto px-0" asChild>
        <Link to={`/predios?local=${props.place.id}`}>
          {t("placePanelOpenRegistry")}
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
    </header>
  );
}

/** Replaces the alert rail while an outdoor place is open: its services and today's status of
 * each, the counterpart of `BuildingPanel` for a place with no floors.
 * @example <PlacePanel place={{ id, name }} points={points} statuses={statuses} ... /> */
export function PlacePanel(props: PlacePanelProps) {
  useEscapeKey(props.onClose);

  return (
    <section aria-labelledby="place-panel-heading" className="bg-card rounded-md border">
      <PanelHeader {...props} />
      <div className="p-4">
        <PanelBody {...props} />
      </div>
    </section>
  );
}
