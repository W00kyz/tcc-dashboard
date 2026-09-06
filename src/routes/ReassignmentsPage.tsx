import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";

type ApiClient = ReturnType<typeof createApiClient>;
type Impediment = components["schemas"]["ImpedimentOut"];
type Candidate = components["schemas"]["ReassignCandidateOut"];
type ImpedimentReason = components["schemas"]["ImpedimentReason"];

const IMPEDIMENTS_QUERY_KEY = ["impediments", "PENDING"] as const;

// Free-text audit note the backend stores on the assignment row; it is not shown to the
// worker, so it stays an English constant rather than an i18n string.
const REASSIGN_REASON = "manual reassignment from the dashboard reassignment queue";

const REASON_LABEL_KEY: Record<ImpedimentReason, StringKey> = {
  ACCESS_BLOCKED: "reassignmentReasonAccessBlocked",
  SITE_REFUSAL: "reassignmentReasonSiteRefusal",
  HEALTH_ISSUE: "reassignmentReasonHealthIssue",
  OTHER: "reassignmentReasonOther",
};

// A route stop counts as still pending for the "N pontos restantes" tally unless the
// worker already closed it (DONE) or skipped it.
function isStopOpen(status: string): boolean {
  return status !== "DONE" && status !== "SKIPPED";
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
        {t("reassignmentsAffectedRemainder").replace("{n}", String(remaining))}
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

  const candidatesQuery = useQuery({
    queryKey: ["impediment-candidates", impedimentId],
    queryFn: () => fetchCandidates(client, impedimentId),
  });

  const reassign = useMutation({
    mutationFn: async (fieldWorkerId: string) => {
      const { response } = await client.POST("/impediments/{impediment_id}/reassign", {
        params: { path: { impediment_id: impedimentId } },
        body: { field_worker_id: fieldWorkerId, reason: REASSIGN_REASON },
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
    return <p className="text-muted-foreground text-sm">{t("reassignmentsCandidatesLoading")}</p>;
  }
  if (candidatesQuery.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t("reassignmentsCandidatesError")}
      </p>
    );
  }
  if (!candidatesQuery.data || candidatesQuery.data.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("reassignmentsCandidatesEmpty")}</p>;
  }

  return (
    <>
      <ul className="divide-border divide-y">
        {candidatesQuery.data.map((candidate) => (
          <li
            key={candidate.field_worker_id}
            className="flex items-center justify-between gap-2 py-2 text-sm"
          >
            <span>
              <span className="font-medium">{candidate.full_name}</span>
              <span className="text-muted-foreground">
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
                setConfirming(candidate);
              }}
            >
              {t("reassignmentsReassign")}
            </Button>
          </li>
        ))}
      </ul>
      {reassign.isError && (
        <p role="alert" className="text-destructive text-sm">
          {t("reassignmentsReassignError")}
        </p>
      )}

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
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConfirming(null);
              }}
            >
              {t("reassignmentsConfirmCancel")}
            </Button>
            <Button
              size="sm"
              disabled={reassign.isPending}
              onClick={() => {
                if (confirming) {
                  reassign.mutate(confirming.field_worker_id);
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

  return (
    <Card data-testid={`impediment-card-${impediment.id}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{t(REASON_LABEL_KEY[impediment.reason])}</CardTitle>
          <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium">
            {t(scopeKey)}
          </span>
        </div>
        <p className="text-muted-foreground font-mono text-xs">
          {`${t("reassignmentsReportedAtPrefix")} ${formatDateTime(impediment.reported_at)}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <AffectedTarget impediment={impediment} />
        {impediment.note && (
          <p className="text-sm">
            <span className="text-muted-foreground">{t("reassignmentsNotePrefix")} </span>
            {impediment.note}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setExpanded((value) => !value);
            }}
          >
            {expanded ? t("reassignmentsHideCandidates") : t("reassignmentsShowCandidates")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={dismiss.isPending}
            onClick={() => {
              dismiss.mutate();
            }}
          >
            {t("reassignmentsDismiss")}
          </Button>
        </div>
        {dismiss.isError && (
          <p role="alert" className="text-destructive text-sm">
            {t("reassignmentsDismissError")}
          </p>
        )}

        {expanded && <CandidateList impedimentId={impediment.id} />}
      </CardContent>
    </Card>
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
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("reassignmentsTitle")}</h1>

      {isLoading && <p className="text-muted-foreground">{t("reassignmentsLoading")}</p>}
      {error && <p className="text-destructive">{t("reassignmentsError")}</p>}
      {!isLoading && !error && impediments?.length === 0 && (
        <p className="text-muted-foreground">{t("reassignmentsEmpty")}</p>
      )}

      {impediments?.map((impediment) => (
        <ImpedimentCard key={impediment.id} impediment={impediment} />
      ))}
    </main>
  );
}
