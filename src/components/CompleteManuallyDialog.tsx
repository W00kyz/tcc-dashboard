import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { toStopStatus } from "@/lib/stopStatus";

type RouteOut = components["schemas"]["RouteOut"];
type RouteStopOut = components["schemas"]["RouteStopOut"];

// The backend caps `reason` at 500 chars (CompleteManuallyBody); anything longer 422s.
const REASON_MAX_LENGTH = 500;

const SELECT_CLASS = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm";
const TEXTAREA_CLASS =
  "border-input min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm";

/** A stop can only be closed without evidence while it is still open — a DONE stop already
 * has an execution and the backend answers 409. */
function pendingStops(route: RouteOut): RouteStopOut[] {
  return route.stops.filter((stop) => toStopStatus(stop.status) !== "DONE");
}

interface CompleteManuallyDialogProps {
  route: RouteOut;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: ReactNode;
}

export function CompleteManuallyDialog({
  route,
  open,
  onOpenChange,
  children,
}: CompleteManuallyDialogProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const stops = pendingStops(route);
  const firstStopId = stops[0]?.id ?? "";

  const [stopId, setStopId] = useState(firstStopId);
  const [reason, setReason] = useState("");

  // After a completion + board refetch the chosen stop leaves `pendingStops`, so a stale
  // `stopId` would no longer match any <option>. Fall back to the first still-open stop.
  const selectedStopId = stops.some((stop) => stop.id === stopId) ? stopId : firstStopId;

  // Closing the dialog (X / Esc / outside click / success) must wipe the previous attempt —
  // otherwise a reopened dialog shows the stale error alert and the last typed reason.
  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      complete.reset();
      setStopId("");
      setReason("");
    }
  }

  const complete = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST(
        "/routes/{route_id}/stops/{stop_id}/complete-manually",
        {
          params: { path: { route_id: route.id, stop_id: selectedStopId } },
          body: { reason: reason.trim() },
        },
      );
      if (!response.ok) {
        throw new Error(
          `POST /routes/${route.id}/stops/${selectedStopId}/complete-manually failed with status ${String(response.status)}.`,
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["routes"] });
      void queryClient.invalidateQueries({ queryKey: ["executions"] });
      // Route the success close through the same reset path a manual close takes.
      handleOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {children != null && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{t("routeCompleteManuallyTitle")}</DialogTitle>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            complete.mutate();
          }}
        >
          <div>
            <Label htmlFor="complete-manually-stop">{t("routeCompleteManuallyStopLabel")}</Label>
            <select
              id="complete-manually-stop"
              className={SELECT_CLASS}
              value={selectedStopId}
              onChange={(event) => {
                setStopId(event.target.value);
              }}
            >
              {stops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {`${String(stop.order_index)}. ${stop.service_point_name}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="complete-manually-reason">
              {t("routeCompleteManuallyReasonLabel")}
            </Label>
            <textarea
              id="complete-manually-reason"
              className={TEXTAREA_CLASS}
              required
              maxLength={REASON_MAX_LENGTH}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </div>
          {complete.isError && (
            <p role="alert" className="text-destructive text-sm">
              {t("routeCompleteManuallyError")}
            </p>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={selectedStopId === "" || reason.trim() === "" || complete.isPending}
          >
            {t("routeCompleteManuallyConfirm")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
