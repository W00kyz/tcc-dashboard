import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { ErrorMessage } from "@/components/layout/StateMessages";
import { nextMaterializeDate } from "@/components/templates/templateSchedule";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useTranslation } from "@/i18n/useTranslation";

type ApiClient = ReturnType<typeof createApiClient>;
type TemplateOut = components["schemas"]["TemplateOut"];

/** Turns a template into a real route for one date (and optionally one worker). */
export function MaterializeDialog({
  client,
  template,
}: {
  client: ApiClient;
  template: TemplateOut;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [routeDate, setRouteDate] = useState(() =>
    nextMaterializeDate(template.recurrence, template.weekdays),
  );
  const [workerId, setWorkerId] = useState("");

  const { data: workers } = useQuery({
    queryKey: ["field-workers"],
    queryFn: async () => {
      const { data } = await client.GET("/field-workers");

      return data ?? [];
    },
    enabled: open,
  });

  const materialize = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/route-templates/{template_id}/materialize", {
        params: { path: { template_id: template.id } },
        body:
          workerId === ""
            ? { route_date: routeDate }
            : { route_date: routeDate, field_worker_id: workerId },
      });
      if (!response.ok) {
        throw new Error(
          `POST /route-templates/${template.id}/materialize failed with status ` +
            String(response.status),
        );
      }
    },
    onSuccess: () => {
      setOpen(false);

      // The board derives its filters from the URL (Task 11), so this lands already scoped to
      // the date the template was materialised for.
      void navigate(`/rotas?date=${routeDate}`);
    },
  });

  // Closing the dialog wipes the previous attempt and re-seeds the default date, mirroring
  // RouteActionsMenu's dialog reset.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      materialize.reset();
      setRouteDate(nextMaterializeDate(template.recurrence, template.weekdays));
      setWorkerId("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarPlus aria-hidden="true" />
          {t("routeTemplateMaterialize")}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>{t("routeTemplateMaterializeTitle")}</DialogTitle>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            materialize.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`materialize-date-${template.id}`}>
              {t("routeTemplateMaterializeDateLabel")}
            </Label>
            <Input
              id={`materialize-date-${template.id}`}
              type="date"
              value={routeDate}
              onChange={(event) => {
                setRouteDate(event.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`materialize-worker-${template.id}`}>
              {t("routeTemplateMaterializeWorkerLabel")}
            </Label>
            <NativeSelect
              id={`materialize-worker-${template.id}`}
              value={workerId}
              onChange={(event) => {
                setWorkerId(event.target.value);
              }}
            >
              <NativeSelectOption value="" />
              {workers?.map((worker) => (
                <NativeSelectOption key={worker.id} value={worker.id}>
                  {worker.full_name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {materialize.isError && <ErrorMessage>{t("routeTemplateError")}</ErrorMessage>}
          <Button type="submit" disabled={routeDate === "" || materialize.isPending}>
            {t("routeTemplateMaterializeSubmit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
