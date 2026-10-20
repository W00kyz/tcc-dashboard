import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { Textarea } from "@/components/ui/textarea";
import { Users } from "lucide-react";
import { EmptyState, ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Badge } from "@/components/ui/badge";

type ApiClient = ReturnType<typeof createApiClient>;
type Impediment = components["schemas"]["ImpedimentOut"];
type Candidate = components["schemas"]["ReassignCandidateOut"];
type ImpedimentReason = components["schemas"]["ImpedimentReason"];

const IMPEDIMENTS_QUERY_KEY = ["impediments", "PENDING"] as const;

// Fallback audit reason (RF21) when the manager confirms without typing one. Stored on
// StopAssignment.transfer_reason and shown back in a pt-BR history drawer (Task 8), so it
// is pt-BR text — a literal here, not an i18n key, because it is persisted data.
const DEFAULT_TRANSFER_REASON = "Reatribuição manual pela fila de reatribuições";

const REASON_LABEL_KEY: Record<ImpedimentReason, StringKey> = {
  ACCESS_BLOCKED: "reassignmentReasonAccessBlocked",
  SITE_REFUSAL: "reassignmentReasonSiteRefusal",
  HEALTH_ISSUE: "reassignmentReasonHealthIssue",
  OTHER: "reassignmentReasonOther",
};

// ROUTE_REMAINDER reassignment moves every still-open stop (backend `_affected_stops`:
// status in PENDING, IN_PROGRESS), so the "N pontos restantes" tally must count both — a
// worker who checked in and then hit a wall still has that stop reassigned.
function isStopOpen(status: string): boolean {
  return status === "PENDING" || status === "IN_PROGRESS";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDistance(distanceM: number): string {
  if (distanceM < 1000) {
    return `${String(Math.round(distanceM))} m`;
  }

  return `${(distanceM / 1000).toFixed(1)} km`;
}

async function fetchPendingImpediments(client: ApiClient): Promise<Impediment[]> {
  const { data, response } = await client.GET("/impediments", {
    params: { query: { status: "PENDING" } },
  });
  if (!response.ok) {
    throw new Error(`GET /impediments?status=PENDING failed (${String(response.status)}).`);
  }

  return data ?? [];
}

async function fetchRoute(client: ApiClient, routeId: string) {
  const { data, response } = await client.GET("/routes/{route_id}", {
    params: { path: { route_id: routeId } },
  });
  if (!response.ok || data === undefined) {
    throw new Error(`GET /routes/${routeId} failed (${String(response.status)}).`);
  }

  return data;
}

async function fetchCandidates(client: ApiClient, impedimentId: string): Promise<Candidate[]> {
  const { data, response } = await client.GET("/impediments/{impediment_id}/candidates", {
    params: { path: { impediment_id: impedimentId } },
  });
  if (!response.ok) {
    throw new Error(
      `GET /impediments/${impedimentId}/candidates failed (${String(response.status)}).`,
    );
  }

  return data ?? [];
}

function AffectedTarget({ impediment }: { impediment: Impediment }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  // `ImpedimentOut` carries only `route_id` + `route_stop_id`, never the point name, so the
  // route is fetched once per expanded card to resolve the affected stop / count the rest.
  const { data: route } = useQuery({
    queryKey: ["route", impediment.route_id],
    queryFn: () => fetchRoute(client, impediment.route_id),
  });

  if (impediment.scope === "ROUTE_REMAINDER") {
    const remaining = route?.stops.filter((stop) => isStopOpen(stop.status)).length;
    if (remaining === undefined) {
      return null;
    }

    return (
      <p className="text-sm">
        {remaining === 1
          ? t("reassignmentsAffectedRemainderOne")
          : t("reassignmentsAffectedRemainder").replace("{n}", String(remaining))}
      </p>
    );
  }

  const stop = route?.stops.find((candidate) => candidate.id === impediment.route_stop_id);

  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{t("reassignmentsAffectedStopPrefix")} </span>
      {stop
        ? `${stop.service_point_name} · ${stop.building_name}`
        : t("reassignmentsAffectedUnknown")}
    </p>
  );
}

function CandidateList({ impedimentId }: { impedimentId: string }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const [confirming, setConfirming] = useState<Candidate | null>(null);
  const [reasonText, setReasonText] = useState("");

  const candidatesQuery = useQuery({
    queryKey: ["impediment-candidates", impedimentId],
    queryFn: () => fetchCandidates(client, impedimentId),
  });

  function openConfirm(candidate: Candidate) {
    setReasonText("");
    setConfirming(candidate);
  }

  const reassign = useMutation({
    mutationFn: async ({ fieldWorkerId, reason }: { fieldWorkerId: string; reason: string }) => {
      const { response } = await client.POST("/impediments/{impediment_id}/reassign", {
        params: { path: { impediment_id: impedimentId } },
        body: { field_worker_id: fieldWorkerId, reason },
      });
      if (!response.ok) {
        throw new Error(
          `POST /impediments/${impedimentId}/reassign failed (${String(response.status)}).`,
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: IMPEDIMENTS_QUERY_KEY });
      setConfirming(null);
    },
  });

  if (candidatesQuery.isLoading) {
    return <LoadingMessage>{t("reassignmentsCandidatesLoading")}</LoadingMessage>;
  }
  if (candidatesQuery.isError) {
    return <ErrorMessage>{t("reassignmentsCandidatesError")}</ErrorMessage>;
  }
  if (!candidatesQuery.data || candidatesQuery.data.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("reassignmentsCandidatesEmpty")}</p>;
  }

  return (
    <>
      <ul className="divide-y rounded-md border">
        {candidatesQuery.data.map((candidate) => (
          <li
            key={candidate.field_worker_id}
            className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
          >
            <span className="min-w-0">
              <span className="text-foreground block font-semibold">{candidate.full_name}</span>
              <span className="text-muted-foreground text-xs">
                {` · ${t("reassignmentsCandidateDistance")} ${formatDistance(candidate.distance_m)}`}
                {` · ${t("reassignmentsCandidateLoad")} ${String(candidate.pending_stop_count)} ${t(
                  "reassignmentsCandidateLoadSuffix",
                )}`}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                openConfirm(candidate);
              }}
            >
              {t("reassignmentsReassign")}
            </Button>
          </li>
        ))}
      </ul>
      {reassign.isError && <ErrorMessage>{t("reassignmentsReassignError")}</ErrorMessage>}

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null);
          }
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>{t("reassignmentsConfirmTitle")}</DialogTitle>
          <p className="text-muted-foreground text-sm">
            {t("reassignmentsConfirmBody").replace("{name}", confirming?.full_name ?? "")}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="reassign-reason">{t("reassignmentsReasonLabel")}</Label>
            <Textarea
              id="reassign-reason"
              value={reasonText}
              onChange={(event) => {
                setReasonText(event.target.value);
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirming(null);
              }}
            >
              {t("reassignmentsConfirmCancel")}
            </Button>
            <Button
              disabled={reassign.isPending}
              onClick={() => {
                if (confirming) {
                  reassign.mutate({
                    fieldWorkerId: confirming.field_worker_id,
                    reason: reasonText.trim() || DEFAULT_TRANSFER_REASON,
                  });
                }
              }}
            >
              {t("reassignmentsConfirmButton")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ImpedimentCard({ impediment }: { impediment: Impediment }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const [expanded, setExpanded] = useState(false);

  const dismiss = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/impediments/{impediment_id}/dismiss", {
        params: { path: { impediment_id: impediment.id } },
      });
      if (!response.ok) {
        throw new Error(
          `POST /impediments/${impediment.id}/dismiss failed (${String(response.status)}).`,
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: IMPEDIMENTS_QUERY_KEY });
    },
  });

  const scopeKey: StringKey =
    impediment.scope === "ROUTE_REMAINDER"
      ? "reassignmentsScopeRemainder"
      : "reassignmentsScopeStop";
  const titleId = `impediment-${impediment.id}-title`;

  return (
    <article aria-labelledby={titleId} className="bg-card rounded-md border">
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id={titleId} className="text-primary text-base leading-tight font-bold">
            {t(REASON_LABEL_KEY[impediment.reason])}
          </h2>
          <Badge variant={impediment.scope === "ROUTE_REMAINDER" ? "late" : "progress"}>
            {t(scopeKey)}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          {`${t("reassignmentsReportedAtPrefix")} ${formatDateTime(impediment.reported_at)}`}
        </p>
        <AffectedTarget impediment={impediment} />
        {impediment.note && (
          <p className="bg-muted/60 rounded-md px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t("reassignmentsNotePrefix")} </span>
            {impediment.note}
          </p>
        )}
        {dismiss.isError && <ErrorMessage>{t("reassignmentsDismissError")}</ErrorMessage>}
        {expanded && <CandidateList impedimentId={impediment.id} />}
      </div>
      <div className="bg-muted/40 flex flex-wrap gap-2 border-t px-4 py-2.5">
        <Button
          size="sm"
          variant={expanded ? "secondary" : "default"}
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          <Users aria-hidden="true" />
          {expanded ? t("reassignmentsHideCandidates") : t("reassignmentsShowCandidates")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={dismiss.isPending}
          onClick={() => {
            dismiss.mutate();
          }}
        >
          {t("reassignmentsDismiss")}
        </Button>
      </div>
    </article>
  );
}

export function ReassignmentsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const {
    data: impediments,
    isLoading,
    error,
  } = useQuery({
    queryKey: IMPEDIMENTS_QUERY_KEY,
    queryFn: () => fetchPendingImpediments(client),
    // Same SSE stand-in poll as the route board (RouteBoardPage.tsx:141) — the queue
    // should surface a freshly reported impediment without a manual refresh.
    refetchInterval: 10_000,
  });

  return (
    <Page width="wide">
      <PageHeader title={t("reassignmentsTitle")} />

      {isLoading && <LoadingMessage>{t("reassignmentsLoading")}</LoadingMessage>}
      {error && <ErrorMessage>{t("reassignmentsError")}</ErrorMessage>}
      {!isLoading && !error && impediments?.length === 0 && (
        <EmptyState>{t("reassignmentsEmpty")}</EmptyState>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {impediments?.map((impediment) => (
          <ImpedimentCard key={impediment.id} impediment={impediment} />
        ))}
      </div>
    </Page>
  );
}
