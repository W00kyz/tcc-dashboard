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

  return (
    <div role="group" aria-label={label} className={CELL_CLASS}>
      {body}
    </div>
  );
}

type PoolKpi = BoardKpis["pool"][number];

interface BoardKpiStripProps {
  kpis: BoardKpis;
  reviewQueue: number | undefined;
  onShowInProgress: () => void;
}

// One cell per service type: "feitos / total" big, then what is in a batch and what is free.
function PoolCell({ pool }: { pool: PoolKpi }) {
  const { t } = useTranslation();

  return (
    <Kpi
      label={`${pool.service_type_name} · ${pool.company_name}`}
      value={`${String(pool.done)} / ${String(pool.total)}`}
      detail={`${t("boardPoolInProgress").replace("{n}", String(pool.in_progress))} · ${t(
        "boardPoolFree",
      ).replace("{n}", String(pool.free))}`}
    />
  );
}

/**
 * The day at a glance, read from the live snapshot (not the filters below it): who is working,
 * what went back to the pool, the open exceptions, then today's points per service type. One
 * plate of cells split by hairlines; a number only turns red or gets a yellow marker when it is
 * an exception the manager should act on.
 */
export function BoardKpiStrip({ kpis, reviewQueue, onShowInProgress }: BoardKpiStripProps) {
  const { t } = useTranslation();
  // pt-BR singular vs. plural, never "1 críticos".
  const count = (n: number, one: StringKey, many: StringKey) =>
    n === 1 ? t(one) : t(many).replace("{n}", String(n));

  return (
    <section aria-label={t("boardKpisLabel")} className="space-y-3">
      <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border xl:grid-cols-4">
        <Kpi
          label={t("boardKpiWorkersOnRoute")}
          value={kpis.workersOnRoute}
          detail={t("boardKpiWorkersOnRouteDetail")}
          onSelect={onShowInProgress}
        />
        <Kpi
          label={t("boardKpiReleasedToday")}
          value={kpis.releasedToday}
          tone={kpis.releasedToday > 0 ? "signal" : "default"}
          detail={t("boardKpiReleasedTodayDetail")}
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
      </div>
      {kpis.pool.length > 0 && (
        <div
          role="group"
          aria-label={t("boardPoolLabel")}
          className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-md border sm:grid-cols-3 xl:grid-cols-4"
        >
          {kpis.pool.map((pool) => (
            <PoolCell key={pool.service_type_id} pool={pool} />
          ))}
        </div>
      )}
    </section>
  );
}
