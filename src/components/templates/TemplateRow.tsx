import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { RouteStopStrip } from "@/components/RouteStopStrip";
import { MaterializeDialog } from "@/components/templates/MaterializeDialog";
import { recurrenceLabelKey, WEEKDAY_OPTIONS } from "@/components/templates/templateSchedule";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

type ApiClient = ReturnType<typeof createApiClient>;
type TemplateOut = components["schemas"]["TemplateOut"];

/** One saved template: its schedule, the active switch and the materialize action. */
export function TemplateRow({ client, template }: { client: ApiClient; template: TemplateOut }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const toggleActive = useMutation({
    mutationFn: async () => {
      const { response } = await client.PATCH("/route-templates/{template_id}", {
        params: { path: { template_id: template.id } },
        body: { is_active: !template.is_active },
      });
      if (!response.ok) {
        throw new Error(
          `PATCH /route-templates/${template.id} failed with status ${String(response.status)}`,
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["route-templates"] });
    },
  });

  const recurringWeekdays = WEEKDAY_OPTIONS.filter((option) =>
    template.weekdays?.includes(option.iso),
  );

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="text-foreground block font-semibold">{template.name}</span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
          {t(recurrenceLabelKey(template.recurrence))}
          {template.recurrence === "WEEKLY" &&
            recurringWeekdays.map((option) => (
              <Badge key={option.iso} variant="plate" className="px-1.5">
                {t(option.key)}
              </Badge>
            ))}
        </span>
      </span>
      {template.stops.length > 0 && (
        <RouteStopStrip
          stops={[...template.stops]
            .sort((first, second) => first.order_index - second.order_index)
            .map((stop) => ({
              id: `${template.id}-${String(stop.order_index)}`,
              orderIndex: stop.order_index,
              status: "PENDING" as const,
            }))}
        />
      )}
      <Label className="font-semibold">
        <input
          type="checkbox"
          checked={template.is_active}
          disabled={toggleActive.isPending}
          onChange={() => {
            toggleActive.mutate();
          }}
        />
        {t("routeTemplateActiveLabel")}
      </Label>
      {toggleActive.isError && (
        <span role="alert" className="text-status-late w-full text-sm font-semibold">
          {t("routeTemplateToggleError")}
        </span>
      )}
      <MaterializeDialog client={client} template={template} />
    </li>
  );
}
