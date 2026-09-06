import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { EvidenceViewer } from "@/components/EvidenceViewer";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";

type ExecutionDetail = components["schemas"]["ExecutionDetail"];
type ExecutionScan = components["schemas"]["ExecutionScan"];
type AnswerOut = components["schemas"]["AnswerOut"];
type ExecutionAssignment = components["schemas"]["ExecutionAssignmentOut"];

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
  CLOCK_SKEW: "executionFlagClockSkew",
};

const SCAN_KIND_LABEL_KEY: Record<string, StringKey> = {
  CHECK_IN: "executionScanCheckIn",
  CHECK_OUT: "executionScanCheckOut",
};

// `outcome` is a bare `string` in the schema; an unknown value falls back to its raw text.
const ASSIGNMENT_OUTCOME_LABEL_KEY: Record<string, StringKey> = {
  EXECUTED: "executionReassignmentOutcomeExecuted",
  REASSIGNED: "executionReassignmentOutcomeReassigned",
  IMPEDED: "executionReassignmentOutcomeImpeded",
  CANCELLED: "executionReassignmentOutcomeCancelled",
};

// Same green/amber/grey vocabulary and label keys as ExecutionHistoryPage's GEO_BADGE.
const GEO_BADGE_CLASS: Record<string, string> = {
  VALIDATED: "bg-green-100 text-green-800",
  OUT_OF_RADIUS: "bg-amber-100 text-amber-800",
  NOT_VALIDATED: "bg-muted text-muted-foreground",
};

const GEO_LABEL_KEY: Record<string, StringKey> = {
  VALIDATED: "executionsGeoValidated",
  OUT_OF_RADIUS: "executionsGeoOutOfRadius",
  NOT_VALIDATED: "executionsGeoNotValidated",
};

type Translate = ReturnType<typeof useTranslation>["t"];

// `geo_validation` is a bare `string` in the schema; an unknown value falls back to its raw
// text, and a null execution-level value renders as an em dash.
function geoLabel(t: Translate, value: string | null): string {
  if (value === null) {
    return "—";
  }
  const key = GEO_LABEL_KEY[value];

  return key ? t(key) : value;
}

function GeoBadge({ value }: { value: string }) {
  const { t } = useTranslation();

  return (
    <span
      className={`${BADGE_CLASS} ${GEO_BADGE_CLASS[value] ?? "bg-muted text-muted-foreground"}`}
    >
      {geoLabel(t, value)}
    </span>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDistance(distanceM: number | null): string {
  return distanceM === null ? "—" : `${String(Math.round(distanceM))} m`;
}

// `value` is `unknown` on the wire (AnswerOut) — the 5 form question types collapse to
// three renderable shapes: BOOLEAN, MULTI_CHOICE (array), and everything else as text.
function formatAnswerValue(t: Translate, value: unknown): string {
  if (typeof value === "boolean") {
    return value ? t("executionFormYes") : t("executionFormNo");
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value);
}

function AnswerRow({ answer }: { answer: AnswerOut }) {
  const { t } = useTranslation();
  const prompt = answer.prompt ?? t("executionFormAnswerRemovedQuestion");

  return (
    <li className="text-sm">
      <span className="text-muted-foreground">{prompt}: </span>
      {formatAnswerValue(t, answer.value)}
    </li>
  );
}

function AssignmentRow({ assignment }: { assignment: ExecutionAssignment }) {
  const { t } = useTranslation();
  const roleKey: StringKey =
    assignment.sequence === 1
      ? "executionReassignmentOriginal"
      : "executionReassignmentTransferred";
  const outcomeKey = assignment.outcome
    ? ASSIGNMENT_OUTCOME_LABEL_KEY[assignment.outcome]
    : undefined;

  return (
    <li className="text-sm">
      <span className="text-muted-foreground">{t(roleKey)}: </span>
      {assignment.full_name}
      <span className="text-muted-foreground">
        {" "}
        ({t("executionReassignmentAssignedBy")} {assignment.assigned_by_name})
      </span>
      {assignment.sequence > 1 && (
        <span className="text-muted-foreground">
          {" — "}
          {t("executionReassignmentReason")}:{" "}
          {assignment.transfer_reason ?? t("executionReassignmentNoReason")}
        </span>
      )}
      {assignment.outcome && (
        <span className={`${BADGE_CLASS} ml-2 bg-muted text-muted-foreground`}>
          {outcomeKey ? t(outcomeKey) : assignment.outcome}
        </span>
      )}
    </li>
  );
}

function ScanRow({ scan }: { scan: ExecutionScan }) {
  const { t } = useTranslation();
  const kindKey = SCAN_KIND_LABEL_KEY[scan.kind];

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{kindKey ? t(kindKey) : scan.kind}</span>
      <GeoBadge value={scan.geo_validation} />
      <span className="text-muted-foreground">{formatDistance(scan.distance_m)}</span>
    </li>
  );
}

function DetailBody({
  detail,
  executionId,
  onClose,
  onLightboxOpenChange,
}: {
  detail: ExecutionDetail;
  executionId: string;
  onClose: () => void;
  onLightboxOpenChange: (open: boolean) => void;
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
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("executionGeoValidationLabel")}: </span>
          {detail.geo_validation === null ? "—" : <GeoBadge value={detail.geo_validation} />}
        </p>
      </section>

      {detail.clock_skew_seconds !== null && (
        <p className="text-amber-800 text-sm font-medium">
          {t("executionClockSkew")}: {Math.round(detail.clock_skew_seconds)} s
        </p>
      )}

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

      {detail.form_version_id !== null && (
        <section>
          <h3 className="text-sm font-semibold">{t("executionFormHeading")}</h3>
          <ul className="mt-1 space-y-1">
            {detail.answers.map((answer) => (
              <AnswerRow key={answer.question_stable_key} answer={answer} />
            ))}
          </ul>
        </section>
      )}

      {detail.reassigned && detail.assignment_history !== null && (
        <section>
          <h3 className="text-sm font-semibold">{t("executionReassignmentHeading")}</h3>
          <ul className="mt-1 space-y-1">
            {detail.assignment_history.map((assignment) => (
              <AssignmentRow key={assignment.sequence} assignment={assignment} />
            ))}
          </ul>
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
            <EvidenceViewer items={detail.evidence} onLightboxOpenChange={onLightboxOpenChange} />
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

  // While the evidence lightbox is open it owns Escape (closes itself first); the drawer's own
  // Escape-to-close stands down until the lightbox is gone. Both listeners fire on every
  // Escape — order is irrelevant because the drawer's is guarded by this flag, not by timing.
  const [lightboxOpen, setLightboxOpen] = useState(false);

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
      if (event.key === "Escape" && !lightboxOpen) {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, lightboxOpen]);

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
          <DetailBody
            detail={detail}
            executionId={executionId}
            onClose={onClose}
            onLightboxOpenChange={setLightboxOpen}
          />
        )}
      </aside>
    </div>
  );
}
