import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { useTranslation } from "@/i18n/useTranslation";

type PersonalData = components["schemas"]["PersonalDataOut"];

const NULL_VALUE = "—";

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
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function MyDataPage() {
  const { t } = useTranslation();
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
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("myDataTitle")}</h1>

      {isLoading && <p className="text-muted-foreground">{t("myDataLoading")}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {t("myDataError")}
        </p>
      )}

      {data && (
        <>
          <Section title={t("myDataProfileHeading")}>
            <dl className="text-sm">
              <DataRow label={t("myDataProfileEmail")} value={data.profile.email} />
              <DataRow label={t("myDataProfileName")} value={data.profile.name} />
              <DataRow label={t("myDataProfileRole")} value={data.profile.role} />
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
                <DataRow
                  label={t("myDataFieldWorkerServiceTypes")}
                  value={
                    data.field_worker.service_type_ids.length > 0
                      ? data.field_worker.service_type_ids.join(", ")
                      : t("myDataEmpty")
                  }
                />
              </dl>
            )}
          </Section>

          <Section title={t("myDataConsentHeading")}>
            {data.consent_history.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("myDataEmpty")}</p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {data.consent_history.map((entry) => (
                  <li
                    key={`${String(entry.notice_version)}-${entry.accepted_at}`}
                    className="flex justify-between gap-4 py-1"
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

          <Section title={t("myDataAuthEventsHeading")}>
            {data.auth_events.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("myDataEmpty")}</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{t("myDataAuthEventColEvent")}</th>
                    <th className="py-1 pr-3 font-medium">{t("myDataAuthEventColIp")}</th>
                    <th className="py-1 font-medium">{t("myDataAuthEventColAt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.auth_events.map((event, index) => (
                    <tr key={`${event.event}-${event.created_at}-${String(index)}`}>
                      <td className="py-1 pr-3">{event.event}</td>
                      <td className="py-1 pr-3">{event.ip_address ?? NULL_VALUE}</td>
                      <td className="py-1">{formatDateTime(event.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        </>
      )}
    </main>
  );
}
