import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { CompleteManuallyDialog } from "@/components/CompleteManuallyDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { toStopStatus } from "@/lib/stopStatus";

type RouteOut = components["schemas"]["RouteOut"];

// PLANNED / IN_PROGRESS routes can still be acted on; a route that is already CANCELLED or
// DONE is terminal and every action is disabled.
const TERMINAL_STATUSES: readonly string[] = ["CANCELLED", "DONE"];

// The backend caps `reason` at 300 chars (ReassignBody / CancelBody); anything longer 422s.
const REASON_MAX_LENGTH = 300;

const SELECT_CLASS = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm";
const TEXTAREA_CLASS =
  "border-input min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm";

// openapi-fetch never rejects on a non-2xx and the optimize endpoint only declares 200/422
// in the contract. Carry the HTTP status so the component can single out the 503 the routing
// service returns while degraded (Etapa 4) from any other failure.
class RouteOptimizeError extends Error {
  constructor(
    readonly status: number,
    routeId: string,
  ) {
    super(`POST /routes/${routeId}/optimize failed with status ${String(status)}.`);
    this.name = "RouteOptimizeError";
  }
}

interface RouteActionsMenuProps {
  route: RouteOut;
}

export function RouteActionsMenu({ route }: RouteActionsMenuProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const disabled = TERMINAL_STATUSES.includes(route.status);

  // "Concluir ponto sem evidência" (RF53) is per-stop: offer it only while the route is live
  // and at least one stop is still open — a DONE stop already has an execution.
  const canCompleteAStopManually =
    !disabled && route.stops.some((stop) => toStopStatus(stop.status) !== "DONE");

  const [reassignOpen, setReassignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [completeManuallyOpen, setCompleteManuallyOpen] = useState(false);
  const [workerId, setWorkerId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  // Only fetched once the reassign dialog opens — the board card itself does not need it.
  const workers = useQuery({
    queryKey: ["field-workers"],
    queryFn: async () => {
      const { data } = await client.GET("/field-workers");

      return data ?? [];
    },
    enabled: reassignOpen,
  });

  function invalidateRoutes() {
    void queryClient.invalidateQueries({ queryKey: ["routes"] });
  }

  const optimize = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/routes/{route_id}/optimize", {
        params: { path: { route_id: route.id } },
      });
      if (!response.ok) {
        throw new RouteOptimizeError(response.status, route.id);
      }
    },
    onSuccess: invalidateRoutes,
  });

  const reassign = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/routes/{route_id}/reassign", {
        params: { path: { route_id: route.id } },
        body: { field_worker_id: workerId, reason: reassignReason.trim() },
      });
      if (!response.ok) {
        throw new Error(
          `POST /routes/${route.id}/reassign failed with status ${String(response.status)}.`,
        );
      }
    },
    onSuccess: () => {
      setReassignOpen(false);
      setWorkerId("");
      setReassignReason("");
      invalidateRoutes();
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/routes/{route_id}/cancel", {
        params: { path: { route_id: route.id } },
        body: { reason: cancelReason.trim() },
      });
      if (!response.ok) {
        throw new Error(
          `POST /routes/${route.id}/cancel failed with status ${String(response.status)}.`,
        );
      }
    },
    onSuccess: () => {
      setCancelOpen(false);
      setCancelReason("");
      invalidateRoutes();
    },
  });

  // Closing a dialog (X / Esc / outside click) must wipe the previous attempt — otherwise a
  // reopened dialog shows the stale error alert and pre-filled fields before any new submit.
  function handleReassignOpenChange(open: boolean) {
    setReassignOpen(open);
    if (!open) {
      reassign.reset();
      setWorkerId("");
      setReassignReason("");
    }
  }

  function handleCancelOpenChange(open: boolean) {
    setCancelOpen(open);
    if (!open) {
      cancel.reset();
      setCancelReason("");
    }
  }

  // Any other optimize failure stays in `optimize.error` without extra UI; the 503 the
  // degraded routing service returns is the one case the manager gets told about.
  const optimizeUnavailable =
    optimize.error instanceof RouteOptimizeError && optimize.error.status === 503;

  return (
    <div data-testid="route-actions" className="flex flex-wrap items-center gap-2">
      {disabled ? (
        <Button variant="outline" size="sm" disabled>
          {t("routeActionEdit")}
        </Button>
      ) : (
        <Button variant="outline" size="sm" asChild>
          <Link to={`/rotas/${route.id}/editar`}>{t("routeActionEdit")}</Link>
        </Button>
      )}

      <Button
        variant="outline"
        size="sm"
        disabled={disabled || optimize.isPending}
        onClick={() => {
          optimize.mutate();
        }}
      >
        {t("routeActionOptimize")}
      </Button>

      <Dialog open={reassignOpen} onOpenChange={handleReassignOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled}>
            {t("routeActionReassign")}
          </Button>
        </DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>{t("routeActionReassignTitle")}</DialogTitle>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              reassign.mutate();
            }}
          >
            <div>
              <Label htmlFor="reassign-worker">{t("routeBuilderWorker")}</Label>
              <select
                id="reassign-worker"
                className={SELECT_CLASS}
                value={workerId}
                onChange={(event) => {
                  setWorkerId(event.target.value);
                }}
              >
                <option value="" />
                {workers.data?.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="reassign-reason">{t("routeActionReassignReason")}</Label>
              <textarea
                id="reassign-reason"
                className={TEXTAREA_CLASS}
                maxLength={REASON_MAX_LENGTH}
                value={reassignReason}
                onChange={(event) => {
                  setReassignReason(event.target.value);
                }}
              />
            </div>
            {reassign.isError && (
              <p role="alert" className="text-destructive text-sm">
                {t("routeActionError")}
              </p>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={workerId === "" || reassignReason.trim() === "" || reassign.isPending}
            >
              {t("routeActionReassignSubmit")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={handleCancelOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled}>
            {t("routeActionCancel")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>{t("routeActionCancelTitle")}</DialogTitle>
          <DialogDescription>{t("routeActionCancelConfirmQuestion")}</DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              cancel.mutate();
            }}
          >
            <div>
              <Label htmlFor="cancel-reason">{t("routeActionCancelReason")}</Label>
              <textarea
                id="cancel-reason"
                className={TEXTAREA_CLASS}
                maxLength={REASON_MAX_LENGTH}
                value={cancelReason}
                onChange={(event) => {
                  setCancelReason(event.target.value);
                }}
              />
            </div>
            {cancel.isError && (
              <p role="alert" className="text-destructive text-sm">
                {t("routeActionError")}
              </p>
            )}
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={cancelReason.trim() === "" || cancel.isPending}
            >
              {t("routeActionCancelSubmit")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {canCompleteAStopManually && (
        <CompleteManuallyDialog
          route={route}
          open={completeManuallyOpen}
          onOpenChange={setCompleteManuallyOpen}
        >
          <Button variant="outline" size="sm">
            {t("routeCompleteManuallyMenuItem")}
          </Button>
        </CompleteManuallyDialog>
      )}

      {optimizeUnavailable && (
        <p role="alert" className="text-destructive w-full text-sm">
          {t("routeActionOptimizeUnavailable")}
        </p>
      )}
    </div>
  );
}
