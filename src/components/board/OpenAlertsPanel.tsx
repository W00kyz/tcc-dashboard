import { AlertOctagon, AlertTriangle, Info, type LucideIcon } from "lucide-react";

import type { BoardSnapshot } from "@/api/monitoringStream";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { cn } from "@/lib/utils";

type BoardAlert = BoardSnapshot["open_alerts"][number];
interface SeverityStyle {
  label: StringKey;
  tone: BadgeTone;
  icon: LucideIcon;
}

// Spec §5 / Ruling 4: INFO grey, WARNING amber, CRITICAL red — always with its word and icon.
const SEVERITY_INFO: SeverityStyle = { label: "alertSeverityInfo", tone: "pending", icon: Info };
const SEVERITY_STYLE: Record<string, SeverityStyle> = {
  INFO: SEVERITY_INFO,
  WARNING: { label: "alertSeverityWarning", tone: "progress", icon: AlertTriangle },
  CRITICAL: { label: "alertSeverityCritical", tone: "late", icon: AlertOctagon },
};

function severityStyle(severity: string): SeverityStyle {
  return SEVERITY_STYLE[severity] ?? SEVERITY_INFO;
}

interface OpenAlertsPanelProps {
  alerts: BoardAlert[];
  onAcknowledge: (alertId: string) => void;
  onResolve: (alertId: string) => void;
  acknowledgePending: boolean;
  resolvePending: boolean;
  actionFailed: boolean;
}

function AlertItem({ alert, ...actions }: { alert: BoardAlert } & OpenAlertsPanelProps) {
  const { t } = useTranslation();
  const style = severityStyle(alert.severity);
  const Icon = style.icon;
  const descriptionId = `alert-${alert.id}-description`;

  return (
    <li
      aria-labelledby={descriptionId}
      className={cn(
        "space-y-2 px-4 py-3",
        alert.severity === "CRITICAL" && "bg-status-late-soft/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={style.tone}>
          <Icon aria-hidden="true" />
          {t(style.label)}
        </Badge>
        {alert.status === "ACKNOWLEDGED" && (
          <span className="text-muted-foreground text-xs">
            {t("monitoringAlertStatusAcknowledged")}
          </span>
        )}
      </div>
      <p id={descriptionId} className="text-sm leading-snug">
        {alert.description}
      </p>
      <div className="flex gap-2">
        {alert.status !== "ACKNOWLEDGED" && (
          <Button
            size="xs"
            variant="outline"
            disabled={actions.acknowledgePending}
            onClick={() => {
              actions.onAcknowledge(alert.id);
            }}
          >
            {t("monitoringAlertAcknowledge")}
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          disabled={actions.resolvePending}
          onClick={() => {
            actions.onResolve(alert.id);
          }}
        >
          {t("monitoringAlertResolve")}
        </Button>
      </div>
    </li>
  );
}

/** The board's exception rail: every open alert, newest state first, with its two actions. */
export function OpenAlertsPanel(props: OpenAlertsPanelProps) {
  const { t } = useTranslation();
  const { alerts } = props;

  return (
    <section aria-labelledby="open-alerts-heading" className="bg-card rounded-md border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 id="open-alerts-heading" className="text-primary text-base font-bold">
          {t("monitoringOpenAlertsTitle")}
        </h2>
        {alerts.length > 0 && (
          <Badge variant="signal" aria-hidden="true">
            {alerts.length}
          </Badge>
        )}
      </div>
      {alerts.length === 0 ? (
        <p className="text-muted-foreground px-4 py-6 text-sm">{t("monitoringNoOpenAlerts")}</p>
      ) : (
        <ul className="divide-y">
          {alerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} {...props} />
          ))}
        </ul>
      )}
      {props.actionFailed && (
        <div className="px-4 pb-4">
          <ErrorMessage>{t("monitoringAlertActionError")}</ErrorMessage>
        </div>
      )}
    </section>
  );
}
