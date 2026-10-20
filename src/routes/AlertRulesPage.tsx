import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { Input } from "@/components/ui/input";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader, Panel } from "@/components/layout/Page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorMessage, LoadingMessage, SuccessMessage } from "@/components/layout/StateMessages";

type AlertRule = components["schemas"]["AlertRuleOut"];
type AlertRulePatch = components["schemas"]["AlertRulePatch"];
type AlertKind = components["schemas"]["AlertKind"];
type Settings = components["schemas"]["SettingsOut"];

const ALERT_RULES_KEY = ["alert-rules"] as const;

// Ruling 8: RF50 ships as these 4 fixed rule kinds, in this order, never a free builder.
const RULE_ORDER: AlertKind[] = ["LATE_START", "WORKER_ABSENT", "LATE_STOP", "NO_EVIDENCE"];

const RULE_LABEL_KEY: Record<AlertKind, StringKey> = {
  LATE_START: "alertRuleLateStart",
  WORKER_ABSENT: "alertRuleWorkerAbsent",
  LATE_STOP: "alertRuleLateStop",
  NO_EVIDENCE: "alertRuleNoEvidence",
};

// The `system_settings` field each rule falls back to when it has no override (backend
// `_GLOBAL_THRESHOLD_ATTR`, Ruling 8).
const GLOBAL_DEFAULT_FIELD: Record<
  AlertKind,
  keyof Pick<
    Settings,
    | "late_start_tolerance_min"
    | "absence_tolerance_min"
    | "late_stop_tolerance_min"
    | "no_evidence_grace_min"
  >
> = {
  LATE_START: "late_start_tolerance_min",
  WORKER_ABSENT: "absence_tolerance_min",
  LATE_STOP: "late_stop_tolerance_min",
  NO_EVIDENCE: "no_evidence_grace_min",
};

function sortRules(rules: AlertRule[]): AlertRule[] {
  return [...rules].sort(
    (a, b) => RULE_ORDER.indexOf(a.rule_kind) - RULE_ORDER.indexOf(b.rule_kind),
  );
}

interface AlertRuleRowProps {
  rule: AlertRule;
  defaultMinutes: number;
  onPatch: (ruleKind: string, body: AlertRulePatch) => void;
  pending: boolean;
}

// The input shows the effective threshold: the rule's override, or the global default from
// `system_settings` when it has none. It is edited locally and only committed on blur; an
// emptied input clears the override (sent as `null`, Ruling 8) and shows the default again.
function AlertRuleRow({ rule, defaultMinutes, onPatch, pending }: AlertRuleRowProps) {
  const { t } = useTranslation();
  const effective = rule.threshold_minutes ?? defaultMinutes;
  const [draft, setDraft] = useState(String(effective));

  // Resync on every server-side save (`updated_at`), not only when the value changes: a save
  // the server did not apply used to leave the input showing a value that was never stored.
  useEffect(() => {
    setDraft(String(rule.threshold_minutes ?? defaultMinutes));
  }, [rule.threshold_minutes, rule.updated_at, defaultMinutes]);

  return (
    <TableRow>
      <TableCell className="font-semibold">{t(RULE_LABEL_KEY[rule.rule_kind])}</TableCell>
      <TableCell>
        <input
          type="checkbox"
          aria-label={t(RULE_LABEL_KEY[rule.rule_kind])}
          checked={rule.enabled}
          disabled={pending}
          onChange={(event) => {
            onPatch(rule.rule_kind, { enabled: event.target.checked });
          }}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            className="w-40"
            aria-label={`${t(RULE_LABEL_KEY[rule.rule_kind])} — ${t("alertRulesColumnThreshold")}`}
            value={draft}
            disabled={pending}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onBlur={() => {
              if (draft === "") {
                setDraft(String(defaultMinutes));
                if (rule.threshold_minutes !== null) {
                  onPatch(rule.rule_kind, { threshold_minutes: null });
                }
              } else if (Number(draft) !== effective) {
                onPatch(rule.rule_kind, { threshold_minutes: Number(draft) });
              }
            }}
          />
          <span className="text-muted-foreground text-sm">
            {rule.threshold_minutes === null
              ? t("alertRulesUsingDefault")
              : t("alertRulesDefaultHint").replace("{n}", String(defaultMinutes))}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function AlertRulesPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const {
    data: rules,
    isLoading,
    error,
  } = useQuery({
    queryKey: ALERT_RULES_KEY,
    queryFn: async () => {
      const { data, response } = await client.GET("/alert-rules");
      if (!response.ok || data === undefined) {
        throw new Error(`GET /alert-rules failed (${String(response.status)}).`);
      }

      return data;
    },
  });

  // Same query as the settings page: the global defaults each rule falls back to.
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, response } = await client.GET("/settings");
      if (!response.ok || data === undefined) {
        throw new Error(`GET /settings failed (${String(response.status)}).`);
      }

      return data;
    },
  });
  const settings = settingsQuery.data;

  const mutation = useMutation({
    mutationFn: async ({ ruleKind, body }: { ruleKind: string; body: AlertRulePatch }) => {
      const { response } = await client.PATCH("/alert-rules/{rule_kind}", {
        params: { path: { rule_kind: ruleKind } },
        body,
      });
      if (!response.ok) {
        throw new Error(`PATCH /alert-rules/${ruleKind} failed (${String(response.status)}).`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ALERT_RULES_KEY });
    },
  });

  if (isLoading || settingsQuery.isLoading) {
    return (
      <Page>
        <LoadingMessage>{t("alertRulesLoading")}</LoadingMessage>
      </Page>
    );
  }
  if (error || rules === undefined || settingsQuery.error || settings === undefined) {
    return (
      <Page>
        <ErrorMessage>{t("alertRulesError")}</ErrorMessage>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title={t("alertRulesTitle")} />
      <Panel>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-semibold">{t("alertRulesColumnRule")}</TableHead>
              <TableHead className="font-semibold">{t("alertRulesColumnEnabled")}</TableHead>
              <TableHead className="font-semibold">{t("alertRulesColumnThreshold")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortRules(rules).map((rule) => (
              <AlertRuleRow
                key={rule.rule_kind}
                rule={rule}
                defaultMinutes={settings[GLOBAL_DEFAULT_FIELD[rule.rule_kind]]}
                pending={mutation.isPending}
                onPatch={(ruleKind, body) => {
                  mutation.mutate({ ruleKind, body });
                }}
              />
            ))}
          </TableBody>
        </Table>
      </Panel>
      {mutation.isError && <ErrorMessage>{t("alertRulesSaveError")}</ErrorMessage>}
      {/* Saving happens on blur/toggle with no button, so say when it went through. */}
      {mutation.isSuccess && <SuccessMessage>{t("alertRulesSaved")}</SuccessMessage>}
    </Page>
  );
}
