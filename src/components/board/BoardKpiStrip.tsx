import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { StringKey } from "@/i18n/strings";
import type { BoardKpis } from "@/lib/boardKpis";
import { useTranslation } from "@/i18n/useTranslation";
import { cn } from "@/lib/utils";

type KpiTone = "default" | "late" | "signal";

const VALUE_TONE: Record<KpiTone, string> = {
  default: "text-primary",
  late: "text-status-late",
  signal: "text-primary",
};

interface KpiProps {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: KpiTone;
  // A KPI that leads somewhere is a link; the whole cell is the target.
  to?: string;
  onSelect?: () => void;
}

function KpiValue({ value, tone }: { value: ReactNode; tone: KpiTone }) {
  return (
    <span className="flex items-center gap-2">
      {tone === "signal" && (
        <span aria-hidden="true" className="bg-signal size-2.5 shrink-0 rounded-full" />
      )}
      <span className={cn("text-[1.75rem] leading-none font-extrabold", VALUE_TONE[tone])}>
        {value}
      </span>
    </span>
  );
}

const CELL_CLASS = "bg-card flex flex-col gap-2 px-4 py-3.5 text-left";
const INTERACTIVE_CLASS = "hover:bg-accent transition-colors focus-visible:outline-offset-[-2px]";

function Kpi({ label, value, detail, tone = "default", to, onSelect }: KpiProps) {
  const body = (
    <>
      <span className="text-muted-foreground text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
        {label}
      </span>
      <KpiValue value={value} tone={tone} />
      <span className="text-muted-foreground text-xs">{detail}</span>
    </>
  );

  if (to !== undefined) {
    return (
      <Link to={to} className={cn(CELL_CLASS, INTERACTIVE_CLASS)}>
        {body}
      </Link>
    );
  }
  if (onSelect !== undefined) {
    return (
      <button type="button" onClick={onSelect} className={cn(CELL_CLASS, INTERACTIVE_CLASS)}>
        {body}
      </button>
    );
  }

  return <div className={CELL_CLASS}>{body}</div>;
}

interface BoardKpiStripProps {
  kpis: BoardKpis;
  reviewQueue: number | undefined;
  onShowInProgress: () => void;
}

/**
 * The day at a glance, read from the live snapshot (not the filters below it). One plate of
 * cells split by hairlines; a number only turns red or gets a yellow marker when it is an
 * exception the manager should act on.
 */
export function BoardKpiStrip({ kpis, reviewQueue, onShowInProgress }: BoardKpiStripProps) {
  const { t } = useTranslation();
  // pt-BR singular vs. plural, never "1 concluídas" or "1 crítico(s)".
  const count = (n: number, one: StringKey, many: StringKey) =>
    n === 1 ? t(one) : t(many).replace("{n}", String(n));

  return (
    <section
      aria-label={t("boardKpisLabel")}
      className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-3 xl:grid-cols-6"
    >
      <Kpi
        label={t("boardKpiRoutes")}
        value={kpis.routeTotal}
        detail={`${count(kpis.routesDone, "boardKpiRoutesDoneOne", "boardKpiRoutesDone")} · ${count(
          kpis.routesCancelled,
          "boardKpiRoutesCancelledOne",
          "boardKpiRoutesCancelled",
        )}`}
      />
      <Kpi
        label={t("boardKpiInProgress")}
        value={kpis.routesInProgress}
        detail={t("boardKpiInProgressDetail")}
        onSelect={onShowInProgress}
      />
      <Kpi
        label={t("boardKpiDelayed")}
        value={kpis.routesDelayed}
        tone={kpis.routesDelayed > 0 ? "late" : "default"}
        detail={kpis.routesDelayed > 0 ? t("boardKpiDelayedDetail") : t("boardKpiAllOnTime")}
      />
      <Kpi
        label={t("boardKpiStops")}
        value={kpis.stopCompletionPercent === null ? "—" : `${String(kpis.stopCompletionPercent)}%`}
        detail={t("boardKpiStopsDetail")
          .replace("{done}", String(kpis.stopsDone))
          .replace("{total}", String(kpis.stopsTotal))}
      />
      <Kpi
        label={t("boardKpiAlerts")}
        value={kpis.alertsOpen}
        tone={kpis.alertsCritical > 0 ? "late" : kpis.alertsOpen > 0 ? "signal" : "default"}
        detail={count(kpis.alertsCritical, "boardKpiAlertsDetailOne", "boardKpiAlertsDetail")}
      />
      <Kpi
        label={t("boardKpiReview")}
        value={reviewQueue ?? "—"}
        tone={reviewQueue !== undefined && reviewQueue > 0 ? "signal" : "default"}
        detail={t("boardKpiReviewDetail")}
        to="/execucoes?review_status=PENDING_REVIEW"
      />
    </section>
  );
}
