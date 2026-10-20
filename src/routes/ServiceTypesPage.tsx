import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { RegistryList, RegistryNewButton } from "@/components/layout/Registry";
import { RegistryDialog, useRegistryDialog } from "@/components/layout/RegistryDialog";
import { assertSaved, RegistryEditButton } from "@/components/layout/registryForm";
import { Badge } from "@/components/ui/badge";

interface ServiceTypeRow {
  id: string;
  name: string;
  average_duration_minutes: number;
}

export function ServiceTypesPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors RouteBoardPage/UsersPage's convention: fall back to an empty token instead of
  // asserting a non-null session, so the page renders (and its request fails cleanly)
  // even before the session has hydrated from storage, rather than crashing on mount.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data: serviceTypes } = useQuery({
    queryKey: ["service-types"],
    queryFn: async () => {
      const { data } = await client.GET("/service-types");

      return data as ServiceTypeRow[];
    },
  });

  const dialog = useRegistryDialog({ name: "", duration: "30" }, ["name", "duration"]);
  const { form } = dialog;
  const duration = Number(form.values.duration);
  const durationInvalid =
    form.values.duration.trim() !== "" && (!Number.isInteger(duration) || duration < 1);

  const save = useMutation({
    mutationFn: async () => {
      const body = { name: form.values.name.trim(), average_duration_minutes: duration };
      if (form.editingId !== null) {
        const { response } = await client.PATCH("/service-types/{service_type_id}", {
          params: { path: { service_type_id: form.editingId } },
          body,
        });
        assertSaved(response, `PATCH /service-types/${form.editingId}`);

        return;
      }
      const { response } = await client.POST("/service-types", { body });
      assertSaved(response, "POST /service-types");
    },
    onSuccess: () => {
      dialog.close();
      void queryClient.invalidateQueries({ queryKey: ["service-types"] });
    },
  });

  return (
    <Page>
      <PageHeader
        title={t("serviceTypesPageTitle")}
        actions={
          <RegistryNewButton
            label={t("serviceTypesNew")}
            onClick={() => {
              save.reset();
              dialog.openNew();
            }}
          />
        }
      />
      <RegistryList
        items={serviceTypes}
        getKey={(item) => item.id}
        renderItem={(item) => (
          <>
            <span className="text-foreground min-w-0 flex-1 font-semibold">{item.name}</span>
            <Badge variant="pending">{item.average_duration_minutes} min</Badge>
            <RegistryEditButton
              itemName={item.name}
              onEdit={() => {
                save.reset();
                dialog.openEdit(item.id, {
                  name: item.name,
                  duration: String(item.average_duration_minutes),
                });
              }}
            />
          </>
        )}
      />
      <RegistryDialog
        dialog={dialog}
        save={save}
        createLabel={t("serviceTypesSubmitCreate")}
        fieldLabels={{
          name: t("serviceTypesFieldName"),
          duration: t("serviceTypesFieldDuration"),
        }}
        problems={durationInvalid ? [t("serviceTypesDurationInvalid")] : []}
        onSubmit={() => {
          save.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="service-type-name">{t("serviceTypesFieldName")}</Label>
          <Input
            id="service-type-name"
            value={form.values.name}
            aria-invalid={form.isInvalid("name")}
            onChange={(event) => {
              form.setField("name", event.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="service-type-duration">{t("serviceTypesFieldDuration")}</Label>
          <Input
            id="service-type-duration"
            type="number"
            min={1}
            step={1}
            value={form.values.duration}
            aria-invalid={form.isInvalid("duration") || durationInvalid}
            onChange={(event) => {
              form.setField("duration", event.target.value);
            }}
          />
        </div>
      </RegistryDialog>
    </Page>
  );
}
