import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { APPEAL_REASON_LABEL_KEY } from "@/lib/appealReason";
import { RELEASE_REASON_LABEL_KEY } from "@/lib/releaseReason";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function Line({ label, children }: { label: StringKey; children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{t(label)}: </span>
      {children}
    </p>
  );
}

function When({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatDateTime(iso)}</time>;
}

/** The accepted appeal an APPEAL execution came from: the worker's reason and note, when the
 * point was released and why, and the manager's review. There is no `GET /appeals/{id}`, so it
 * is found in the accepted list — the only status an execution's appeal can have. */
export function ExecutionAppeal({ appealId }: { appealId: string }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");
  const { data: appeals, isError } = useQuery({
    queryKey: ["appeals", "ACCEPTED"],
    queryFn: async () => {
      const { data, response } = await client.GET("/appeals", {
        params: { query: { status: "ACCEPTED" } },
      });
      if (!response.ok || data === undefined) {
        throw new Error(
          `GET /appeals?status=ACCEPTED failed with status ${String(response.status)}.`,
        );
      }

      return data;
    },
  });
  const appeal = appeals?.find((candidate) => candidate.id === appealId);

  return (
    <section aria-labelledby="execution-appeal-heading">
      <h3
        id="execution-appeal-heading"
        className="text-muted-foreground mb-2 text-[0.6875rem] font-bold tracking-[0.08em] uppercase"
      >
        {t("executionAppealHeading")}
      </h3>
      {(isError || (appeals !== undefined && appeal === undefined)) && (
        <ErrorMessage>{t("executionAppealError")}</ErrorMessage>
      )}
      {!isError && appeals === undefined && (
        <LoadingMessage>{t("executionAppealLoading")}</LoadingMessage>
      )}
      {appeal !== undefined && (
        <div className="space-y-0.5">
          <Line label="executionAppealReason">{t(APPEAL_REASON_LABEL_KEY[appeal.reason])}</Line>
          {appeal.note && <Line label="executionAppealNote">{appeal.note}</Line>}
          {appeal.claimed_executed_at && (
            <Line label="executionAppealClaimedAt">
              <When iso={appeal.claimed_executed_at} />
            </Line>
          )}
          <Line label="executionAppealReleased">
            <When iso={appeal.released_at} /> · {t(RELEASE_REASON_LABEL_KEY[appeal.release_reason])}
          </Line>
          {appeal.reviewed_at && (
            <Line label="executionAppealReviewedAt">
              <When iso={appeal.reviewed_at} />
            </Line>
          )}
          {appeal.reviewed_by_name && (
            // Accepted by whom: an appeal execution has no evidence, so this is its audit trail.
            <p className="text-sm font-semibold">
              {t("appealAcceptedBy").replace("{name}", appeal.reviewed_by_name)}
            </p>
          )}
          {appeal.review_note && (
            <Line label="executionAppealReviewNote">{appeal.review_note}</Line>
          )}
        </div>
      )}
    </section>
  );
}
