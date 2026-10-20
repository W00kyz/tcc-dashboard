import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { roleLabelKey } from "@/auth/roleLabel";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type PersonalData = components["schemas"]["PersonalDataOut"];

const NULL_VALUE = "—";

// auth_logs.event codes (backend AuthLogEvent) in the words the user reads.
const AUTH_EVENT_LABEL_KEY: Partial<Record<string, StringKey>> = {
  LOGIN_SUCCESS: "authEventLoginSuccess",
  LOGIN_FAILURE: "authEventLoginFailure",
  LOGOUT: "authEventLogout",
};

function formatDateTime(iso: string | null): string {
  if (iso === null) {
    return NULL_VALUE;
  }

  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Base-1000 units so the number matches what an object storage bill reports (RNF10 export).
function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "kB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log10(bytes) / 3));
  const value = bytes / 1000 ** exponent;

  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent] ?? "B"}`;
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold break-all">{value}</dd>
    </div>
  );
}

function Section({
  title,
  wide = false,
  children,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn("bg-card rounded-md border", wide && "lg:col-span-2")}>
      <h2 className="text-primary border-b px-4 py-3 text-base font-bold">{title}</h2>
      <div className="p-4 [&_dl]:divide-y">{children}</div>
    </section>
  );
}

export function MyDataPage() {
  const { t } = useTranslation();
  // A code the dashboard does not know yet is shown as-is rather than as a blank cell.
  const labelOrRaw = (key: StringKey | null, raw: string) => (key === null ? raw : t(key));
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data, isLoading, error } = useQuery({
    queryKey: ["me-personal-data"],
    queryFn: async (): Promise<PersonalData> => {
      const { data: body, response } = await client.GET("/me/personal-data");
      if (!response.ok || body === undefined) {
        throw new Error(
          `GET /me/personal-data failed (${String(response.status)}); expected a PersonalDataOut body.`,
        );
      }

      return body;
    },
  });

  return (
    <Page>
      <PageHeader title={t("myDataTitle")} />

      {isLoading && <LoadingMessage>{t("myDataLoading")}</LoadingMessage>}
      {error && <ErrorMessage>{t("myDataError")}</ErrorMessage>}

      {data && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Section title={t("myDataProfileHeading")}>
            <dl className="text-sm">
              <DataRow label={t("myDataProfileEmail")} value={data.profile.email} />
              <DataRow label={t("myDataProfileName")} value={data.profile.name} />
              <DataRow
                label={t("myDataProfileRole")}
                value={labelOrRaw(roleLabelKey(data.profile.role), data.profile.role)}
              />
              <DataRow
                label={t("myDataProfileActive")}
                value={data.profile.is_active ? t("myDataYes") : t("myDataNo")}
              />
              <DataRow
                label={t("myDataProfileCreatedAt")}
                value={formatDateTime(data.profile.created_at)}
              />
            </dl>
          </Section>

          <Section title={t("myDataFieldWorkerHeading")}>
            {data.field_worker === null ? (
              <p className="text-muted-foreground text-sm">{t("myDataFieldWorkerNone")}</p>
            ) : (
              <dl className="text-sm">
                <DataRow
                  label={t("myDataFieldWorkerFullName")}
                  value={data.field_worker.full_name}
                />
                <DataRow
                  label={t("myDataFieldWorkerCompany")}
                  value={data.field_worker.contractor_company_id}
                />
              </dl>
            )}
          </Section>

          <Section wide title={t("myDataConsentHeading")}>
            {data.consent_history.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("myDataEmpty")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {data.consent_history.map((entry) => (
                  <li
                    key={`${String(entry.notice_version)}-${entry.accepted_at}`}
                    className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0"
                  >
                    <span>
                      {t("myDataConsentNoticeVersion")} {entry.notice_version}
                    </span>
                    <span className="text-muted-foreground">
                      {t("myDataConsentAcceptedAt")} {formatDateTime(entry.accepted_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section wide title={t("myDataAuthEventsHeading")}>
            {data.auth_events.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("myDataEmpty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("myDataAuthEventColEvent")}</TableHead>
                    <TableHead>{t("myDataAuthEventColIp")}</TableHead>
                    <TableHead>{t("myDataAuthEventColAt")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.auth_events.map((event, index) => (
                    <TableRow key={`${event.event}-${event.created_at}-${String(index)}`}>
                      <TableCell>
                        {labelOrRaw(AUTH_EVENT_LABEL_KEY[event.event] ?? null, event.event)}
                      </TableCell>
                      <TableCell>{event.ip_address ?? NULL_VALUE}</TableCell>
                      <TableCell>{formatDateTime(event.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>

          <Section title={t("myDataExecutionsHeading")}>
            <dl className="text-sm">
              <DataRow
                label={t("myDataSummaryTotal")}
                value={String(data.executions_summary.total)}
              />
              <DataRow
                label={t("myDataSummaryFirstAt")}
                value={formatDateTime(data.executions_summary.first_at)}
              />
              <DataRow
                label={t("myDataSummaryLastAt")}
                value={formatDateTime(data.executions_summary.last_at)}
              />
            </dl>
          </Section>

          <Section title={t("myDataEvidenceHeading")}>
            <dl className="text-sm">
              <DataRow
                label={t("myDataSummaryItems")}
                value={String(data.evidence_summary.total_items)}
              />
              <DataRow
                label={t("myDataSummaryBytes")}
                value={formatBytes(data.evidence_summary.total_bytes)}
              />
            </dl>
          </Section>

          <Section title={t("myDataPositionsHeading")}>
            <dl className="text-sm">
              <DataRow
                label={t("myDataSummaryTotal")}
                value={String(data.positions_summary.total)}
              />
              <DataRow
                label={t("myDataSummaryFirstAt")}
                value={formatDateTime(data.positions_summary.first_at)}
              />
              <DataRow
                label={t("myDataSummaryLastAt")}
                value={formatDateTime(data.positions_summary.last_at)}
              />
            </dl>
          </Section>

          <Section title={t("myDataNotificationsHeading")}>
            <dl className="text-sm">
              <DataRow
                label={t("myDataSummaryTotal")}
                value={String(data.notifications_summary.total)}
              />
              <DataRow
                label={t("myDataSummaryUnread")}
                value={String(data.notifications_summary.unread)}
              />
            </dl>
          </Section>
        </div>
      )}
    </Page>
  );
}
