import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RegistryList, RegistryNewButton } from "@/components/layout/Registry";
import { RegistryDialog, useRegistryDialog } from "@/components/layout/RegistryDialog";
import { assertSaved, RegistryEditButton } from "@/components/layout/registryForm";

interface FieldWorkerRow {
  id: string;
  full_name: string;
  contractor_company_id: string;
  service_type_ids: string[];
  user_id: string | null;
}
interface CompanyRow {
  id: string;
  name: string;
  cnpj: string;
}
interface ServiceTypeRow {
  id: string;
  name: string;
  average_duration_minutes: number;
}
// Finding C2: mirrors the backend's LinkableUserOut — the dedicated projection
// GET /field-workers/linkable-users returns for this dropdown (already filtered
// server-side to FIELD_WORKER-role users not yet linked to a worker), not the full
// UserOut shape GET /users returns.
interface LinkableUserRow {
  id: string;
  name: string;
  email: string;
}

function splitIds(joined: string): string[] {
  return joined === "" ? [] : joined.split(",");
}

export function FieldWorkersPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors RouteBoardPage/UsersPage/ServiceTypesPage/ContractorCompaniesPage's convention:
  // fall back to an empty token instead of asserting a non-null session, so the page renders
  // (and its requests fail cleanly) even before the session has hydrated from storage.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data: workers } = useQuery({
    queryKey: ["field-workers"],
    queryFn: async () => {
      const { data } = await client.GET("/field-workers");

      return data as FieldWorkerRow[];
    },
  });
  const { data: companies } = useQuery({
    queryKey: ["contractor-companies"],
    queryFn: async () => {
      const { data } = await client.GET("/contractor-companies");

      return data as CompanyRow[];
    },
  });
  const { data: serviceTypes } = useQuery({
    queryKey: ["service-types"],
    queryFn: async () => {
      const { data } = await client.GET("/service-types");

      return data as ServiceTypeRow[];
    },
  });
  // Finding C2: GET /users is Admin-only, so a Manager (who owns this whole screen) got a
  // silent 403 here and an empty dropdown. GET /field-workers/linkable-users is Manager-or-
  // Admin and already does the "FIELD_WORKER-role, not yet linked" filtering server-side, so
  // there is no client-side filter to compute any more — render its response directly.
  const { data: linkableUsers } = useQuery({
    queryKey: ["field-workers", "linkable-users"],
    queryFn: async () => {
      const { data } = await client.GET("/field-workers/linkable-users");

      return data as LinkableUserRow[];
    },
  });

  // `serviceTypeIds` rides the string-only form as a comma-joined list so "at least one
  // service type" is checked like any other required field.
  const dialog = useRegistryDialog(
    { fullName: "", companyId: "", serviceTypeIds: "", linkedUserId: "" },
    ["fullName", "companyId", "serviceTypeIds"],
  );
  const { form } = dialog;
  const selectedServiceTypeIds = splitIds(form.values.serviceTypeIds);
  const editedWorker = workers?.find((worker) => worker.id === form.editingId);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        full_name: form.values.fullName.trim(),
        contractor_company_id: form.values.companyId,
        service_type_ids: selectedServiceTypeIds,
        user_id: form.values.linkedUserId || null,
      };
      if (form.editingId !== null) {
        const { response } = await client.PATCH("/field-workers/{worker_id}", {
          params: { path: { worker_id: form.editingId } },
          body,
        });
        assertSaved(response, `PATCH /field-workers/${form.editingId}`);

        return;
      }
      const { response } = await client.POST("/field-workers", { body });
      assertSaved(response, "POST /field-workers");
    },
    onSuccess: () => {
      dialog.close();
      void queryClient.invalidateQueries({ queryKey: ["field-workers"] });
    },
  });

  function toggleServiceType(id: string, checked: boolean) {
    const next = checked
      ? [...selectedServiceTypeIds, id]
      : selectedServiceTypeIds.filter((selected) => selected !== id);
    form.setField("serviceTypeIds", next.join(","));
  }

  function companyName(id: string): string {
    return companies?.find((company) => company.id === id)?.name ?? id;
  }

  return (
    <Page>
      <PageHeader
        title={t("fieldWorkersPageTitle")}
        actions={
          <RegistryNewButton
            label={t("fieldWorkersNew")}
            onClick={() => {
              save.reset();
              dialog.openNew();
            }}
          />
        }
      />
      <RegistryList
        items={workers}
        getKey={(worker) => worker.id}
        renderItem={(worker) => (
          <>
            <span className="text-foreground min-w-0 flex-1 font-semibold">{worker.full_name}</span>
            <span className="text-muted-foreground text-sm">
              {companyName(worker.contractor_company_id)}
            </span>
            <RegistryEditButton
              itemName={worker.full_name}
              onEdit={() => {
                save.reset();
                dialog.openEdit(worker.id, {
                  fullName: worker.full_name,
                  companyId: worker.contractor_company_id,
                  serviceTypeIds: worker.service_type_ids.join(","),
                  linkedUserId: worker.user_id ?? "",
                });
              }}
            />
          </>
        )}
      />
      <RegistryDialog
        dialog={dialog}
        save={save}
        createLabel={t("fieldWorkersSubmitCreate")}
        fieldLabels={{
          fullName: t("fieldWorkersFieldName"),
          companyId: t("fieldWorkersFieldCompany"),
          serviceTypeIds: t("fieldWorkersFieldServiceTypes"),
        }}
        onSubmit={() => {
          save.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="worker-name">{t("fieldWorkersFieldName")}</Label>
          <Input
            id="worker-name"
            value={form.values.fullName}
            aria-invalid={form.isInvalid("fullName")}
            onChange={(event) => {
              form.setField("fullName", event.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="worker-company">{t("fieldWorkersFieldCompany")}</Label>
          <NativeSelect
            id="worker-company"
            value={form.values.companyId}
            aria-invalid={form.isInvalid("companyId")}
            onChange={(event) => {
              form.setField("companyId", event.target.value);
            }}
          >
            <NativeSelectOption value="" />
            {companies?.map((company) => (
              <NativeSelectOption key={company.id} value={company.id}>
                {company.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {/* Checkboxes, not <select multiple>: Ctrl-click to pick a second type is not
         * something the PU staff should have to know. */}
        <fieldset className="space-y-2" aria-invalid={form.isInvalid("serviceTypeIds")}>
          <legend className="text-sm leading-none font-semibold">
            {t("fieldWorkersFieldServiceTypes")}
          </legend>
          <div className="mt-3 space-y-2">
            {serviceTypes?.map((serviceType) => (
              <Label key={serviceType.id} className="font-normal">
                <input
                  type="checkbox"
                  checked={selectedServiceTypeIds.includes(serviceType.id)}
                  onChange={(event) => {
                    toggleServiceType(serviceType.id, event.target.checked);
                  }}
                />
                {serviceType.name}
              </Label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="worker-linked-user">{t("fieldWorkersFieldLinkedUser")}</Label>
          <NativeSelect
            id="worker-linked-user"
            value={form.values.linkedUserId}
            onChange={(event) => {
              form.setField("linkedUserId", event.target.value);
            }}
          >
            <NativeSelectOption value="">{t("fieldWorkersNoLinkedUser")}</NativeSelectOption>
            {/* linkable-users lists only users not linked yet, so the worker being edited
             * would otherwise lose its own login from the options. */}
            {editedWorker?.user_id && (
              <NativeSelectOption value={editedWorker.user_id}>
                {t("fieldWorkersKeepLinkedUser")}
              </NativeSelectOption>
            )}
            {linkableUsers?.map((user) => (
              <NativeSelectOption key={user.id} value={user.id}>
                {user.name} — {user.email}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </RegistryDialog>
    </Page>
  );
}
