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
import { ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";

type AlertRule = components["schemas"]["AlertRuleOut"];
type AlertRulePatch = components["schemas"]["AlertRulePatch"];
type AlertKind = components["schemas"]["AlertKind"];

const ALERT_RULES_KEY = ["alert-rules"] as const;

// Ruling 8: RF50 ships as these 4 fixed rule kinds, in this order, never a free builder.
const RULE_ORDER: AlertKind[] = ["LATE_START", "WORKER_ABSENT", "LATE_STOP", "NO_EVIDENCE"];

const RULE_LABEL_KEY: Record<AlertKind, StringKey> = {
  LATE_START: "alertRuleLateStart",
  WORKER_ABSENT: "alertRuleWorkerAbsent",
  LATE_STOP: "alertRuleLateStop",
  NO_EVIDENCE: "alertRuleNoEvidence",
};

function sortRules(rules: AlertRule[]): AlertRule[] {
  return [...rules].sort(
    (a, b) => RULE_ORDER.indexOf(a.rule_kind) - RULE_ORDER.indexOf(b.rule_kind),
  );
}

interface AlertRuleRowProps {
  rule: AlertRule;
  onPatch: (ruleKind: string, body: AlertRulePatch) => void;
  pending: boolean;
}

// The threshold input is edited locally and only committed on blur: an empty input means
// "usar o padrão global de system_settings" (Ruling 8), so it is sent as `null`.
function AlertRuleRow({ rule, onPatch, pending }: AlertRuleRowProps) {
  const { t } = useTranslation();
  const [threshold, setThreshold] = useState<number | null>(rule.threshold_minutes);

  useEffect(() => {
    setThreshold(rule.threshold_minutes);
  }, [rule.threshold_minutes]);

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
        <Input
          type="number"
          className="w-40"
          aria-label={`${t(RULE_LABEL_KEY[rule.rule_kind])} — ${t("alertRulesColumnThreshold")}`}
          placeholder={t("alertRulesThresholdPlaceholder")}
          value={threshold ?? ""}
          disabled={pending}
          onChange={(event) => {
            setThreshold(event.target.value === "" ? null : Number(event.target.value));
          }}
          onBlur={() => {
            if (threshold !== rule.threshold_minutes) {
              onPatch(rule.rule_kind, { threshold_minutes: threshold });
            }
          }}
        />
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

  if (isLoading) {
    return (
      <Page>
        <LoadingMessage>{t("alertRulesLoading")}</LoadingMessage>
      </Page>
    );
  }
  if (error || rules === undefined) {
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
    </Page>
  );
}
