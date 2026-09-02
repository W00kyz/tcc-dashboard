import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { EvidenceViewer } from "@/components/EvidenceViewer";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";

type ExecutionDetail = components["schemas"]["ExecutionDetail"];
type ExecutionScan = components["schemas"]["ExecutionScan"];

interface ExecutionDetailDrawerProps {
  executionId: string | null;
  onClose: () => void;
}

const BADGE_CLASS = "inline-block rounded px-2 py-0.5 text-xs font-medium";

// `validation_flags` is typed as bare `string[]`; a value outside this set falls back to its
// raw text so a new backend flag still shows up instead of disappearing.
const FLAG_LABEL_KEY: Record<string, StringKey> = {
  OUT_OF_RADIUS: "executionFlagOutOfRadius",
  OUTSIDE_SCHEDULE: "executionFlagOutsideSchedule",
  QR_SUPERSEDED: "executionFlagQrSuperseded",
  GPS_UNAVAILABLE: "executionFlagGpsUnavailable",
  ROOM_CHOSEN_MANUALLY: "executionFlagRoomChosenManually",
};

const SCAN_KIND_LABEL_KEY: Record<string, StringKey> = {
  CHECK_IN: "executionScanCheckIn",
  CHECK_OUT: "executionScanCheckOut",
};

// Same green/amber/grey vocabulary as ExecutionHistoryPage's GEO_BADGE.
const GEO_BADGE_CLASS: Record<string, string> = {
  VALIDATED: "bg-green-100 text-green-800",
  OUT_OF_RADIUS: "bg-amber-100 text-amber-800",
  NOT_VALIDATED: "bg-muted text-muted-foreground",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDistance(distanceM: number | null): string {
  return distanceM === null ? "—" : `${String(Math.round(distanceM))} m`;
}

function ScanRow({ scan }: { scan: ExecutionScan }) {
  const { t } = useTranslation();
  const kindKey = SCAN_KIND_LABEL_KEY[scan.kind];

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{kindKey ? t(kindKey) : scan.kind}</span>
      <span className={`${BADGE_CLASS} ${GEO_BADGE_CLASS[scan.geo_validation] ?? "bg-muted"}`}>
        {scan.geo_validation}
      </span>
      <span className="text-muted-foreground">{formatDistance(scan.distance_m)}</span>
    </li>
  );
}

function DetailBody({
  detail,
  executionId,
  onClose,
}: {
  detail: ExecutionDetail;
  executionId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const resolveReview = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/executions/{execution_id}/review/resolve", {
        params: { path: { execution_id: executionId } },
      });
      if (!response.ok) {
        throw new Error(
          `POST /executions/${executionId}/review/resolve failed with status ${String(
            response.status,
          )}.`,
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["executions"] });
      void queryClient.invalidateQueries({ queryKey: ["execution", executionId] });
    },
  });

  return (
    <div className="mt-4 space-y-6">
      <section>
        <h3 className="text-sm font-semibold">{t("executionTimelineHeading")}</h3>
        <p className="text-sm">
          <span className="text-muted-foreground">{t("executionCheckInLabel")}: </span>
          <time dateTime={detail.checked_in_at}>{formatDateTime(detail.checked_in_at)}</time>
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">{t("executionCheckOutLabel")}: </span>
          {detail.checked_out_at ? (
            <time dateTime={detail.checked_out_at}>{formatDateTime(detail.checked_out_at)}</time>
          ) : (
            "—"
          )}
        </p>
      </section>

      {detail.validation_flags.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">{t("executionFlagsHeading")}</h3>
          <div className="mt-1 flex flex-wrap gap-2">
            {detail.validation_flags.map((flag) => {
              const labelKey = FLAG_LABEL_KEY[flag];

              return (
                <span key={flag} className={`${BADGE_CLASS} bg-amber-100 text-amber-800`}>
                  {labelKey ? t(labelKey) : flag}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {detail.scans.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">{t("executionScansHeading")}</h3>
          <ul className="mt-1 space-y-1">
            {detail.scans.map((scan) => (
              <ScanRow key={`${scan.kind}-${scan.scanned_at}`} scan={scan} />
            ))}
          </ul>
        </section>
      )}

      {detail.manual_completion !== null && (
        <section>
          <h3 className="text-sm font-semibold">{t("executionManualCompletionHeading")}</h3>
          <p className="text-sm">
            <span className="text-muted-foreground">{t("executionManualCompletionReason")}: </span>
            {detail.manual_completion.reason}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">{t("executionManualCompletionBy")}: </span>
            {detail.manual_completion.completed_by}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">{t("executionManualCompletionAt")}: </span>
            <time dateTime={detail.manual_completion.completed_at}>
              {formatDateTime(detail.manual_completion.completed_at)}
            </time>
          </p>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold">{t("executionEvidenceHeading")}</h3>
        {detail.evidence.length === 0 ? (
          <p className="text-muted-foreground mt-1 text-sm">{t("executionNoEvidence")}</p>
        ) : (
          <div className="mt-1">
            <EvidenceViewer items={detail.evidence} />
          </div>
        )}
      </section>

      {detail.review_status === "PENDING_REVIEW" && (
        <section className="space-y-2">
          <Button
            type="button"
            size="sm"
            disabled={resolveReview.isPending}
            onClick={() => {
              resolveReview.mutate();
            }}
          >
            {t("executionResolveReviewButton")}
          </Button>
          {resolveReview.isError && (
            <p role="alert" className="text-destructive text-sm">
              {t("executionResolveReviewError")}
            </p>
          )}
        </section>
      )}

      <button type="button" className="text-sm underline" onClick={onClose}>
        {t("executionDetailDrawerClose")}
      </button>
    </div>
  );
}

export function ExecutionDetailDrawer({ executionId, onClose }: ExecutionDetailDrawerProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data: detail, isError } = useQuery({
    queryKey: ["execution", executionId],
    enabled: executionId !== null,
    queryFn: async () => {
      const { data, response } = await client.GET("/executions/{execution_id}", {
        params: { path: { execution_id: executionId ?? "" } },
      });
      if (!response.ok || data === undefined) {
        throw new Error(
          `GET /executions/${String(executionId)} failed with status ${String(response.status)}.`,
        );
      }

      return data;
    },
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (executionId === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="bg-black/40 absolute inset-0" aria-hidden="true" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("executionDetailDrawerTitle")}
        className="bg-background relative z-10 w-full max-w-md overflow-y-auto border-l p-6 shadow-lg"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("executionDetailDrawerTitle")}</h2>
          <button
            type="button"
            aria-label={t("executionDetailDrawerClose")}
            className="text-xl leading-none"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {isError && (
          <p role="alert" className="text-destructive mt-4 text-sm">
            {t("executionDetailError")}
          </p>
        )}
        {!isError && detail === undefined && (
          <p className="text-muted-foreground mt-4 text-sm">{t("executionDetailLoading")}</p>
        )}
        {detail !== undefined && (
          <DetailBody detail={detail} executionId={executionId} onClose={onClose} />
        )}
      </aside>
    </div>
  );
}
