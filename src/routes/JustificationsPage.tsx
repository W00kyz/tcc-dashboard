import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "radix-ui";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import {
  type ReviewTarget,
  ReviewAppealDialog,
} from "@/components/justifications/ReviewAppealDialog";
import { Page, PageHeader, Panel } from "@/components/layout/Page";
import { assertSaved, RegistrySaveError } from "@/components/layout/registryForm";
import { EmptyState, ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JUSTIFICATIONS_KEY } from "@/hooks/usePendingJustificationsCount";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { APPEAL_REASON_LABEL_KEY } from "@/lib/appealReason";
import { IMPEDIMENT_REASON_LABEL_KEY } from "@/lib/impedimentReason";
import { RELEASE_REASON_LABEL_KEY } from "@/lib/releaseReason";
import { cn } from "@/lib/utils";

type Impediment = components["schemas"]["ImpedimentOut"];
type Appeal = components["schemas"]["AppealOut"];

const HOUR_MS = 3_600_000;
const TAB_CLASS =
  "text-muted-foreground hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-primary focus-visible:ring-ring/50 -mb-px border-b-2 border-transparent px-4 py-2 text-sm font-semibold focus-visible:ring-[3px] focus-visible:outline-none";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Pending items first; the API order (newest first) is kept inside each group.
function pendingFirst<Item extends { status: string }>(items: Item[]): Item[] {
  return [
    ...items.filter((i) => i.status === "PENDING"),
    ...items.filter((i) => i.status !== "PENDING"),
  ];
}

function useDecision<Variables>(
  request: (variables: Variables) => Promise<Response>,
  onDone: () => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: Variables) => {
      assertSaved(await request(variables), "justification decision");
    },
    onSettled: () => {
      onDone();
      // A conflict means the list was stale, so it is refreshed on failure as well.
      void queryClient.invalidateQueries({ queryKey: JUSTIFICATIONS_KEY });
    },
  });
}

const muted = "text-muted-foreground";

function Cell({ children }: { children: string | null }) {
  const { t } = useTranslation();

  return (
    <TableCell>{children ?? <span className={muted}>{t("justificationsNoValue")}</span>}</TableCell>
  );
}

function Head({ label }: { label: StringKey }) {
  const { t } = useTranslation();

  return <TableHead>{t(label)}</TableHead>;
}

function ImpedimentsTable({
  impediments,
  pending,
  onAcknowledge,
}: {
  impediments: Impediment[];
  pending: boolean;
  onAcknowledge: (impediment: Impediment) => void;
}) {
  const { t } = useTranslation();
  if (impediments.length === 0) {
    return <EmptyState>{t("justificationsImpedimentsEmpty")}</EmptyState>;
  }

  return (
    <Panel>
      <Table>
        <TableHeader>
          <TableRow>
            <Head label="justificationsColWorker" />
            <Head label="justificationsColPoint" />
            <Head label="justificationsColBuilding" />
            <Head label="justificationsColReason" />
            <Head label="justificationsColNote" />
            <Head label="justificationsColWhen" />
            <Head label="justificationsColStatus" />
            <Head label="justificationsColActions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendingFirst(impediments).map((impediment) => (
            <TableRow key={impediment.id}>
              <TableCell className="font-semibold">{impediment.field_worker_name}</TableCell>
              <TableCell>
                {impediment.service_point_name ?? t("justificationsRouteRemainder")}
              </TableCell>
              <Cell>{impediment.building_name}</Cell>
              <TableCell>{t(IMPEDIMENT_REASON_LABEL_KEY[impediment.reason])}</TableCell>
              <Cell>{impediment.note}</Cell>
              <TableCell>{formatDateTime(impediment.reported_at)}</TableCell>
              <TableCell>
                <Badge variant={impediment.status === "PENDING" ? "pending" : "done"}>
                  {t(
                    impediment.status === "PENDING"
                      ? "justificationsImpedimentPending"
                      : "justificationsImpedimentResolved",
                  )}
                </Badge>
              </TableCell>
              <TableCell>
                {impediment.status === "PENDING" && (
                  <Button
                    type="button"
                    size="sm"
                    aria-label={t("justificationsAcknowledgeAria").replace(
                      "{name}",
                      impediment.field_worker_name,
                    )}
                    disabled={pending}
                    onClick={() => {
                      onAcknowledge(impediment);
                    }}
                  >
                    {t("justificationsAcknowledge")}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

function AppealDecisionCell({
  appeal,
  onReview,
}: {
  appeal: Appeal;
  onReview: (target: ReviewTarget) => void;
}) {
  const { t } = useTranslation();
  if (appeal.status === "PENDING") {
    return (
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          aria-label={t("justificationsAcceptAria").replace("{name}", appeal.field_worker_name)}
          onClick={() => {
            onReview({ appeal, decision: "accept" });
          }}
        >
          {t("justificationsAccept")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={t("justificationsRejectAria").replace("{name}", appeal.field_worker_name)}
          onClick={() => {
            onReview({ appeal, decision: "reject" });
          }}
        >
          {t("justificationsReject")}
        </Button>
      </div>
    );
  }
  const label = t(appeal.status === "ACCEPTED" ? "appealAcceptedBy" : "appealRejectedBy").replace(
    "{name}",
    appeal.reviewed_by_name ?? "",
  );

  return (
    <div className="space-y-0.5">
      <p className={cn("font-semibold", appeal.status === "REJECTED" && "text-status-late")}>
        {label}
      </p>
      {appeal.review_note !== null && <p className={cn("text-xs", muted)}>{appeal.review_note}</p>}
    </div>
  );
}

function AppealsTable({
  appeals,
  windowHours,
  onReview,
}: {
  appeals: Appeal[];
  /** appeal_window_hours; undefined until the settings load. */
  windowHours: number | undefined;
  onReview: (target: ReviewTarget) => void;
}) {
  const { t } = useTranslation();
  if (appeals.length === 0) {
    return <EmptyState>{t("justificationsAppealsEmpty")}</EmptyState>;
  }

  return (
    <Panel>
      <Table>
        <TableHeader>
          <TableRow>
            <Head label="justificationsColWorker" />
            <Head label="justificationsColPoint" />
            <Head label="justificationsColReleaseReason" />
            <Head label="justificationsColAppealReason" />
            <Head label="justificationsColNote" />
            <Head label="justificationsColClaimedAt" />
            <Head label="justificationsColDeadline" />
            <Head label="justificationsColActions" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendingFirst(appeals).map((appeal) => (
            <TableRow key={appeal.id}>
              <TableCell className="font-semibold">{appeal.field_worker_name}</TableCell>
              <TableCell>
                {appeal.service_point_name}
                <span className={cn("block text-xs", muted)}>{appeal.building_name}</span>
              </TableCell>
              <TableCell>{t(RELEASE_REASON_LABEL_KEY[appeal.release_reason])}</TableCell>
              <TableCell>{t(APPEAL_REASON_LABEL_KEY[appeal.reason])}</TableCell>
              <Cell>{appeal.note}</Cell>
              <Cell>
                {appeal.claimed_executed_at === null
                  ? null
                  : formatDateTime(appeal.claimed_executed_at)}
              </Cell>
              {/* released_at + appeal_window_hours: the manager list carries no deadline. */}
              <Cell>
                {windowHours === undefined
                  ? null
                  : formatDateTime(
                      new Date(
                        Date.parse(appeal.released_at) + windowHours * HOUR_MS,
                      ).toISOString(),
                    )}
              </Cell>
              <TableCell>
                <AppealDecisionCell appeal={appeal} onReview={onReview} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

/** Manager's inbox of worker reports: impediments (acknowledge only) and appeals against
 * released points (accept or reject), spec 2026-10-20-alocacao-automatica §8.4. */
export function JustificationsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");
  const [review, setReview] = useState<ReviewTarget | null>(null);

  const impediments = useQuery({
    queryKey: [...JUSTIFICATIONS_KEY, "impediments"],
    queryFn: async () => {
      const { data, response } = await client.GET("/impediments");
      if (!response.ok || data === undefined) {
        throw new Error(`GET /impediments failed (${String(response.status)}).`);
      }

      return data;
    },
  });
  const appeals = useQuery({
    queryKey: [...JUSTIFICATIONS_KEY, "appeals"],
    queryFn: async () => {
      const { data, response } = await client.GET("/appeals");
      if (!response.ok || data === undefined) {
        throw new Error(`GET /appeals failed (${String(response.status)}).`);
      }

      return data;
    },
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, response } = await client.GET("/settings");
      if (!response.ok) {
        throw new Error("failed-to-load-settings");
      }

      return data;
    },
  });

  const acknowledge = useDecision(
    (impediment: Impediment) =>
      client
        .POST("/impediments/{impediment_id}/acknowledge", {
          params: { path: { impediment_id: impediment.id } },
        })
        .then(({ response }) => response),
    () => undefined,
  );
  const decide = useDecision(
    ({ appeal, decision, note }: ReviewTarget & { note: string | null }) => {
      const params = { params: { path: { appeal_id: appeal.id } }, body: { note } };

      return (
        decision === "accept"
          ? client.POST("/appeals/{appeal_id}/accept", params)
          : client.POST("/appeals/{appeal_id}/reject", params)
      ).then(({ response }) => response);
    },
    () => {
      setReview(null);
    },
  );

  const failure = [acknowledge.error, decide.error].find((error) => error !== null);
  const pendingImpediments = impediments.data?.filter((i) => i.status === "PENDING").length;
  const pendingAppeals = appeals.data?.filter((a) => a.status === "PENDING").length;
  const withCount = (label: StringKey, count: number | undefined) =>
    count === undefined || count === 0 ? t(label) : `${t(label)} (${String(count)})`;

  return (
    <Page>
      <PageHeader title={t("justificationsTitle")} />
      {failure !== undefined && (
        <ErrorMessage>
          {failure instanceof RegistrySaveError && failure.status === 409
            ? t("justificationsAlreadyReviewed")
            : t("justificationsActionError")}
        </ErrorMessage>
      )}
      <Tabs.Root defaultValue="impediments" className="space-y-4">
        <Tabs.List
          aria-label={t("justificationsTabsLabel")}
          className="border-border flex border-b"
        >
          <Tabs.Trigger value="impediments" className={TAB_CLASS}>
            {withCount("justificationsTabImpediments", pendingImpediments)}
          </Tabs.Trigger>
          <Tabs.Trigger value="appeals" className={TAB_CLASS}>
            {withCount("justificationsTabAppeals", pendingAppeals)}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="impediments">
          {impediments.isError && <ErrorMessage>{t("justificationsLoadError")}</ErrorMessage>}
          {impediments.isLoading && <LoadingMessage>{t("justificationsLoading")}</LoadingMessage>}
          {impediments.data !== undefined && (
            <ImpedimentsTable
              impediments={impediments.data}
              pending={acknowledge.isPending}
              onAcknowledge={(impediment) => {
                acknowledge.mutate(impediment);
              }}
            />
          )}
        </Tabs.Content>
        <Tabs.Content value="appeals">
          {appeals.isError && <ErrorMessage>{t("justificationsLoadError")}</ErrorMessage>}
          {appeals.isLoading && <LoadingMessage>{t("justificationsLoading")}</LoadingMessage>}
          {appeals.data !== undefined && (
            <AppealsTable
              appeals={appeals.data}
              windowHours={settings.data?.appeal_window_hours}
              onReview={setReview}
            />
          )}
        </Tabs.Content>
      </Tabs.Root>
      <ReviewAppealDialog
        target={review}
        pending={decide.isPending}
        onCancel={() => {
          setReview(null);
        }}
        onConfirm={(note) => {
          if (review !== null) {
            decide.mutate({ ...review, note });
          }
        }}
      />
    </Page>
  );
}
