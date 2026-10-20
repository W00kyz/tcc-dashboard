import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, type Location, useLocation } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { CompleteManuallyDialog } from "@/components/CompleteManuallyDialog";
import { Button } from "@/components/ui/button";
import { Ban, Ellipsis, Pencil, Repeat, Route, SquareCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorMessage } from "@/components/layout/StateMessages";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { cn } from "@/lib/utils";
import { toStopStatus } from "@/lib/stopStatus";

type RouteOut = components["schemas"]["RouteOut"];

// PLANNED / IN_PROGRESS routes can still be acted on; a route that is already CANCELLED or
// DONE is terminal and every action is disabled.
const TERMINAL_STATUSES: readonly string[] = ["CANCELLED", "DONE"];

// The backend caps `reason` at 300 chars (ReassignBody / CancelBody); anything longer 422s.
const REASON_MAX_LENGTH = 300;

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
  // Table rows: icon-only buttons that keep the same accessible names as the full labels.
  compact?: boolean;
}

// Editing opens the route builder Dialog over the board, keeping the board's own filters.
function editLink(location: Location, routeId: string): string {
  const params = new URLSearchParams(location.search);
  params.delete("nova");
  params.set("editar", routeId);

  return `/rotas?${params.toString()}`;
}
export function RouteActionsMenu({ route, compact = false }: RouteActionsMenuProps) {
  const location = useLocation();
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
  const [optimizeOpen, setOptimizeOpen] = useState(false);
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

  // The 503 the degraded routing service returns gets its own explanation; any other failure
  // the generic one. (Before, success and every non-503 failure showed nothing at all, so
  // "Otimizar" looked like a dead menu item.)
  const optimizeUnavailable =
    optimize.error instanceof RouteOptimizeError && optimize.error.status === 503;
  const optimizeOutcome: StringKey = optimize.isPending
    ? "routeActionOptimizePending"
    : optimize.isSuccess
      ? "routeActionOptimizeDone"
      : optimizeUnavailable
        ? "routeActionOptimizeUnavailable"
        : "routeActionError";

  function handleOptimizeOpenChange(open: boolean) {
    setOptimizeOpen(open);
    if (!open) {
      optimize.reset();
    }
  }

  const buttonSize = compact ? "icon-sm" : "sm";
  // Icon-only buttons keep the visible label as their accessible name and as a hover title.
  const labelIfCompact = (key: StringKey) =>
    compact ? { "aria-label": t(key), "title": t(key) } : {};

  return (
    <div
      role="group"
      aria-label={t("routeActionsGroupLabel")}
      className={cn("flex items-center gap-1", compact ? "flex-nowrap" : "flex-wrap")}
    >
      {disabled ? (
        <Button variant="ghost" size={buttonSize} disabled {...labelIfCompact("routeActionEdit")}>
          <Pencil aria-hidden="true" />
          {!compact && t("routeActionEdit")}
        </Button>
      ) : (
        <Button variant="ghost" size={buttonSize} asChild>
          <Link to={editLink(location, route.id)} {...labelIfCompact("routeActionEdit")}>
            <Pencil aria-hidden="true" />
            {!compact && t("routeActionEdit")}
          </Link>
        </Button>
      )}

      <Dialog open={reassignOpen} onOpenChange={handleReassignOpenChange}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size={buttonSize}
            disabled={disabled}
            {...labelIfCompact("routeActionReassign")}
          >
            <Repeat aria-hidden="true" />
            {!compact && t("routeActionReassign")}
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
            <div className="space-y-1.5">
              <Label htmlFor="reassign-worker">{t("routeBuilderWorker")}</Label>
              <NativeSelect
                id="reassign-worker"
                value={workerId}
                onChange={(event) => {
                  setWorkerId(event.target.value);
                }}
              >
                <NativeSelectOption value="" />
                {/* Reassigning to the worker who already has the route is not a reassignment. */}
                {workers.data
                  ?.filter((worker) => worker.id !== route.field_worker_id)
                  .map((worker) => (
                    <NativeSelectOption key={worker.id} value={worker.id}>
                      {worker.full_name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reassign-reason">{t("routeActionReassignReason")}</Label>
              <Textarea
                id="reassign-reason"
                maxLength={REASON_MAX_LENGTH}
                value={reassignReason}
                onChange={(event) => {
                  setReassignReason(event.target.value);
                }}
              />
            </div>
            {reassign.isError && <ErrorMessage>{t("routeActionError")}</ErrorMessage>}
            <Button
              type="submit"
              disabled={workerId === "" || reassignReason.trim() === "" || reassign.isPending}
            >
              {t("routeActionReassignSubmit")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={handleCancelOpenChange}>
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
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason">{t("routeActionCancelReason")}</Label>
              <Textarea
                id="cancel-reason"
                maxLength={REASON_MAX_LENGTH}
                value={cancelReason}
                onChange={(event) => {
                  setCancelReason(event.target.value);
                }}
              />
            </div>
            {cancel.isError && <ErrorMessage>{t("routeActionError")}</ErrorMessage>}
            <Button
              type="submit"
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
        />
      )}

      {/* The rarer actions live behind one overflow trigger so the route line, not a row of
       * five buttons, carries the card. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={buttonSize}
            className={compact ? undefined : "ml-auto"}
            aria-label={t("routeActionsMore")}
            disabled={disabled}
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={optimize.isPending}
            onSelect={() => {
              setOptimizeOpen(true);
              optimize.mutate();
            }}
          >
            <Route aria-hidden="true" />
            {t("routeActionOptimize")}
          </DropdownMenuItem>
          {canCompleteAStopManually && (
            <DropdownMenuItem
              onSelect={() => {
                setCompleteManuallyOpen(true);
              }}
            >
              <SquareCheck aria-hidden="true" />
              {t("routeCompleteManuallyMenuItem")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              setCancelOpen(true);
            }}
          >
            <Ban aria-hidden="true" />
            {t("routeActionCancel")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* A dialog, not an inline line: the board row's action cell is too narrow to hold a
       * message, and the outcome has to be read before the manager moves on. */}
      <Dialog open={optimizeOpen} onOpenChange={handleOptimizeOpenChange}>
        <DialogContent>
          <DialogTitle>{t("routeActionOptimizeTitle")}</DialogTitle>
          {optimize.isError ? (
            <ErrorMessage>{t(optimizeOutcome)}</ErrorMessage>
          ) : (
            <DialogDescription role="status">{t(optimizeOutcome)}</DialogDescription>
          )}
          <Button
            type="button"
            variant="outline"
            className="self-end"
            disabled={optimize.isPending}
            onClick={() => {
              handleOptimizeOpenChange(false);
            }}
          >
            {t("routeActionOptimizeClose")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
