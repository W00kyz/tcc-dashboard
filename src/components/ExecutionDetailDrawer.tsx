import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { EvidenceViewer } from "@/components/EvidenceViewer";
import { MediaAnswerPhotos } from "@/components/execution/MediaAnswerPhotos";
import {
  type MediaAnswerPhotos as MediaAnswerPhotosData,
  splitEvidenceByAnswers,
} from "@/components/execution/mediaAnswers";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { X } from "lucide-react";
import { ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Badge, type BadgeTone } from "@/components/ui/badge";

type ExecutionDetail = components["schemas"]["ExecutionDetail"];
type ExecutionScan = components["schemas"]["ExecutionScan"];
type AnswerOut = components["schemas"]["AnswerOut"];
type ExecutionAssignment = components["schemas"]["ExecutionAssignmentOut"];

interface ExecutionDetailDrawerProps {
  executionId: string | null;
  onClose: () => void;
}

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
const GEO_BADGE_TONE: Record<string, BadgeTone> = {
  VALIDATED: "done",
  OUT_OF_RADIUS: "progress",
  NOT_VALIDATED: "pending",
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

  return <Badge variant={GEO_BADGE_TONE[value] ?? "pending"}>{geoLabel(t, value)}</Badge>;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDistance(distanceM: number | null): string {
  return distanceM === null ? "—" : `${String(Math.round(distanceM))} m`;
}

// `value` is `unknown` on the wire (AnswerOut) — the text-like question types collapse to
// three renderable shapes: BOOLEAN, MULTI_CHOICE (array), and everything else as text. MEDIA
// renders its photos instead (MediaAnswerPhotos).
function formatAnswerValue(t: Translate, value: unknown): string {
  if (typeof value === "boolean") {
    return value ? t("executionFormYes") : t("executionFormNo");
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value);
}

interface AnswerRowProps {
  answer: AnswerOut;
  /** Set for a MEDIA answer: its photos, shown instead of the raw list of keys. */
  media: MediaAnswerPhotosData | undefined;
  onLightboxOpenChange: (open: boolean) => void;
}

function AnswerRow({ answer, media, onLightboxOpenChange }: AnswerRowProps) {
  const { t } = useTranslation();
  const prompt = answer.prompt ?? t("executionFormAnswerRemovedQuestion");

  return (
    <li className="text-sm">
      <span className="text-muted-foreground">{prompt}: </span>
      {media === undefined ? (
        formatAnswerValue(t, answer.value)
      ) : (
        <MediaAnswerPhotos entry={media} onLightboxOpenChange={onLightboxOpenChange} />
      )}
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
        <span className="bg-status-pending-soft text-status-pending ml-2 rounded-[3px] px-2 py-0.5 text-xs font-semibold">
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
  // Photos a MEDIA answer lists show under that question, not again among the loose evidence.
  const evidence = splitEvidenceByAnswers(detail.answers, detail.evidence);

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
    <div className="divide-y [&>*]:py-4 [&>*:first-child]:pt-0">
      <section>
        <h3 className="text-muted-foreground mb-2 text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
          {t("executionTimelineHeading")}
        </h3>
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
        <p className="text-status-progress text-sm font-semibold">
          {t("executionClockSkew")}: {Math.round(detail.clock_skew_seconds)} s
        </p>
      )}

      {detail.validation_flags.length > 0 && (
        <section>
          <h3 className="text-muted-foreground mb-2 text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
            {t("executionFlagsHeading")}
          </h3>
          <div className="mt-1 flex flex-wrap gap-2">
            {detail.validation_flags.map((flag) => {
              const labelKey = FLAG_LABEL_KEY[flag];

              return (
                <Badge key={flag} variant="progress">
                  {labelKey ? t(labelKey) : flag}
                </Badge>
              );
            })}
          </div>
        </section>
      )}

      {detail.form_version_id !== null && (
        <section>
          <h3 className="text-muted-foreground mb-2 text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
            {t("executionFormHeading")}
          </h3>
          <ul className="mt-1 space-y-1">
            {detail.answers.map((answer) => (
              <AnswerRow
                key={answer.question_stable_key}
                answer={answer}
                media={evidence.byQuestion.get(answer.question_stable_key)}
                onLightboxOpenChange={onLightboxOpenChange}
              />
            ))}
          </ul>
        </section>
      )}

      {detail.reassigned && detail.assignment_history !== null && (
        <section>
          <h3 className="text-muted-foreground mb-2 text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
            {t("executionReassignmentHeading")}
          </h3>
          <ul className="mt-1 space-y-1">
            {detail.assignment_history.map((assignment) => (
              <AssignmentRow key={assignment.sequence} assignment={assignment} />
            ))}
          </ul>
        </section>
      )}

      {detail.scans.length > 0 && (
        <section>
          <h3 className="text-muted-foreground mb-2 text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
            {t("executionScansHeading")}
          </h3>
          <ul className="mt-1 space-y-1">
            {detail.scans.map((scan) => (
              <ScanRow key={`${scan.kind}-${scan.scanned_at}`} scan={scan} />
            ))}
          </ul>
        </section>
      )}

      {detail.manual_completion !== null && (
        <section>
          <h3 className="text-muted-foreground mb-2 text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
            {t("executionManualCompletionHeading")}
          </h3>
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
        <h3 className="text-muted-foreground mb-2 text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
          {t("executionEvidenceHeading")}
        </h3>
        {evidence.loose.length === 0 ? (
          <p className="text-muted-foreground mt-1 text-sm">{t("executionNoEvidence")}</p>
        ) : (
          <div className="mt-1">
            <EvidenceViewer items={evidence.loose} onLightboxOpenChange={onLightboxOpenChange} />
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
          {resolveReview.isError && <ErrorMessage>{t("executionResolveReviewError")}</ErrorMessage>}
        </section>
      )}

      <div>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("executionDetailDrawerClose")}
        </Button>
      </div>
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
      <div
        className="bg-primary/30 animate-in fade-in-0 absolute inset-0"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("executionDetailDrawerTitle")}
        className="bg-card animate-in slide-in-from-right-8 relative z-10 flex w-full max-w-lg flex-col border-l shadow-[-8px_0_24px_-12px_rgb(20_33_61/0.35)] duration-200 ease-out"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-5">
          <h2 className="text-primary text-base font-bold">{t("executionDetailDrawerTitle")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("executionDetailDrawerClose")}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {isError && <ErrorMessage>{t("executionDetailError")}</ErrorMessage>}
          {!isError && detail === undefined && (
            <LoadingMessage>{t("executionDetailLoading")}</LoadingMessage>
          )}
          {detail !== undefined && (
            <DetailBody
              detail={detail}
              executionId={executionId}
              onClose={onClose}
              onLightboxOpenChange={setLightboxOpen}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
