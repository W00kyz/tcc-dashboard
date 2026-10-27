import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { Page, PageHeader, Section } from "@/components/layout/Page";
import { RegistryList } from "@/components/layout/Registry";
import { assertSaved, RegistrySaveError } from "@/components/layout/registryForm";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FieldWorkerConfirmDialog } from "@/components/workers/FieldWorkerConfirmDialog";
import { RejectWorkerDialog } from "@/components/workers/RejectWorkerDialog";
import { useTranslation } from "@/i18n/useTranslation";

type FieldWorkerRow = components["schemas"]["FieldWorkerOut"];
type WorkerAction = "approve" | "reject" | "deactivate" | "reactivate";

interface Transition {
  worker: FieldWorkerRow;
  action: WorkerAction;
  reason?: string | null;
}

// The dialog a row action opened; approving needs no confirmation.
type OpenDialog = { worker: FieldWorkerRow; kind: "reject" | "deactivate" | "reactivate" } | null;

function formatRegistered(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function groupByCompany(workers: FieldWorkerRow[]): [string, FieldWorkerRow[]][] {
  const groups = new Map<string, FieldWorkerRow[]>();
  for (const worker of workers) {
    const name = worker.contractor_company_name;
    groups.set(name, [...(groups.get(name) ?? []), worker]);
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
}

const muted = "text-muted-foreground text-sm";

// Workers sign themselves up from the app and the manager approves them (spec 2026-10-20 §8.3).
export function FieldWorkersPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors RouteBoardPage/UsersPage/ContractorCompaniesPage's convention: fall back to an
  // empty token instead of asserting a non-null session, so the page renders (and its request
  // fails cleanly) even before the session has hydrated from storage.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");
  const [dialog, setDialog] = useState<OpenDialog>(null);

  const { data: workers } = useQuery({
    queryKey: ["field-workers"],
    queryFn: async () => {
      const { data, response } = await client.GET("/field-workers");
      if (!response.ok || data === undefined) {
        throw new Error(`GET /field-workers failed with status ${String(response.status)}.`);
      }

      return data;
    },
  });

  const transition = useMutation({
    mutationFn: async ({ worker, action, reason }: Transition) => {
      const params = { params: { path: { worker_id: worker.id } } };
      const request = `POST /field-workers/${worker.id}/${action}`;
      const { response } =
        action === "approve"
          ? await client.POST("/field-workers/{worker_id}/approve", params)
          : action === "reject"
            ? await client.POST("/field-workers/{worker_id}/reject", {
                ...params,
                body: { reason: reason ?? null },
              })
            : action === "deactivate"
              ? await client.POST("/field-workers/{worker_id}/deactivate", params)
              : await client.POST("/field-workers/{worker_id}/reactivate", params);
      assertSaved(response, request);
    },
    onSettled: () => {
      setDialog(null);
      // A conflict means the list was stale, so it is refreshed on failure as well.
      void queryClient.invalidateQueries({ queryKey: ["field-workers"] });
    },
  });

  const run = (worker: FieldWorkerRow, action: WorkerAction, reason?: string | null) => {
    transition.mutate({ worker, action, reason });
  };

  const pending = workers?.filter((worker) => worker.status === "PENDING_APPROVAL") ?? [];
  const rejected = workers?.filter((worker) => worker.status === "REJECTED") ?? [];
  const approved = workers?.filter((worker) => worker.status === "APPROVED") ?? [];

  return (
    <Page>
      <PageHeader title={t("fieldWorkersPageTitle")} />
      {transition.error !== null && (
        <ErrorMessage>
          {transition.error instanceof RegistrySaveError && transition.error.status === 409
            ? t("fieldWorkersInvalidStatus")
            : t("fieldWorkersActionError")}
        </ErrorMessage>
      )}
      {pending.length > 0 && (
        <Section title={t("fieldWorkersPendingHeading")}>
          <RegistryList
            items={pending}
            getKey={(worker) => worker.id}
            renderItem={(worker) => (
              <>
                <span className="text-foreground min-w-0 flex-1 font-semibold">
                  {worker.full_name}
                </span>
                <span className={muted}>{worker.email}</span>
                <span className={muted}>{worker.contractor_company_name}</span>
                <span className={muted}>
                  {t("fieldWorkersRegisteredOn").replace(
                    "{date}",
                    formatRegistered(worker.created_at),
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  aria-label={t("fieldWorkersApproveWorker").replace("{name}", worker.full_name)}
                  disabled={transition.isPending}
                  onClick={() => {
                    run(worker, "approve");
                  }}
                >
                  {t("fieldWorkersApprove")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={t("fieldWorkersRejectWorker").replace("{name}", worker.full_name)}
                  onClick={() => {
                    setDialog({ worker, kind: "reject" });
                  }}
                >
                  {t("fieldWorkersReject")}
                </Button>
              </>
            )}
          />
        </Section>
      )}
      {groupByCompany(approved).map(([company, companyWorkers]) => (
        <Section key={company} title={company}>
          <RegistryList
            items={companyWorkers}
            getKey={(worker) => worker.id}
            renderItem={(worker) => (
              <>
                <span className="text-foreground min-w-0 flex-1 font-semibold">
                  {worker.full_name}
                </span>
                <span className={muted}>{worker.email}</span>
                <span className={muted}>
                  {worker.is_active
                    ? t("fieldWorkersStatusActive")
                    : t("fieldWorkersStatusInactive")}
                </span>
                <span className={muted}>
                  {t("fieldWorkersDoneToday").replace("{n}", String(worker.done_today))}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={t(
                    worker.is_active
                      ? "fieldWorkersDeactivateWorker"
                      : "fieldWorkersReactivateWorker",
                  ).replace("{name}", worker.full_name)}
                  onClick={() => {
                    setDialog({ worker, kind: worker.is_active ? "deactivate" : "reactivate" });
                  }}
                >
                  {t(worker.is_active ? "fieldWorkersDeactivate" : "fieldWorkersReactivate")}
                </Button>
              </>
            )}
          />
        </Section>
      ))}
      {rejected.length > 0 && (
        <Collapsible className="space-y-3">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="group -ml-3 font-bold">
              <ChevronRight
                aria-hidden="true"
                className="transition-transform group-data-[state=open]:rotate-90"
              />
              {t("fieldWorkersRejectedHeading").replace("{n}", String(rejected.length))}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <RegistryList
              items={rejected}
              getKey={(worker) => worker.id}
              renderItem={(worker) => (
                <>
                  <span className="text-foreground min-w-0 flex-1 font-semibold">
                    {worker.full_name}
                  </span>
                  <span className={muted}>{worker.email}</span>
                  <span className={muted}>{worker.contractor_company_name}</span>
                  {worker.rejection_reason !== null && (
                    <span className={muted}>
                      {t("fieldWorkersRejectionReason").replace(
                        "{reason}",
                        worker.rejection_reason,
                      )}
                    </span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    aria-label={t("fieldWorkersApproveWorker").replace("{name}", worker.full_name)}
                    disabled={transition.isPending}
                    onClick={() => {
                      run(worker, "approve");
                    }}
                  >
                    {t("fieldWorkersApprove")}
                  </Button>
                </>
              )}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
      <RejectWorkerDialog
        workerName={dialog?.kind === "reject" ? dialog.worker.full_name : null}
        pending={transition.isPending}
        onCancel={() => {
          setDialog(null);
        }}
        onReject={(reason) => {
          if (dialog !== null) {
            run(dialog.worker, "reject", reason);
          }
        }}
      />
      <FieldWorkerConfirmDialog
        target={
          dialog !== null && dialog.kind !== "reject" ? { ...dialog, kind: dialog.kind } : null
        }
        pending={transition.isPending}
        onCancel={() => {
          setDialog(null);
        }}
        onConfirm={() => {
          if (dialog !== null && dialog.kind !== "reject") {
            run(dialog.worker, dialog.kind);
          }
        }}
      />
    </Page>
  );
}
