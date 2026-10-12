import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RegistryLayout, RegistryList } from "@/components/layout/Registry";

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

  const [fullName, setFullName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [selectedServiceTypeIds, setSelectedServiceTypeIds] = useState<string[]>([]);
  const [linkedUserId, setLinkedUserId] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      await client.POST("/field-workers", {
        body: {
          full_name: fullName,
          contractor_company_id: companyId,
          service_type_ids: selectedServiceTypeIds,
          user_id: linkedUserId || null,
        },
      });
    },
    onSuccess: () => {
      setFullName("");
      setCompanyId("");
      setSelectedServiceTypeIds([]);
      setLinkedUserId("");
      void queryClient.invalidateQueries({ queryKey: ["field-workers"] });
    },
  });

  function companyName(id: string): string {
    return companies?.find((company) => company.id === id)?.name ?? id;
  }

  return (
    <Page>
      <PageHeader title={t("fieldWorkersPageTitle")} />
      <RegistryLayout
        list={
          <RegistryList
            items={workers}
            getKey={(worker) => worker.id}
            renderItem={(worker) => (
              <>
                <span className="text-foreground min-w-0 flex-1 font-semibold">
                  {worker.full_name}
                </span>
                <span className="text-muted-foreground text-sm">
                  {companyName(worker.contractor_company_id)}
                </span>
              </>
            )}
          />
        }
        form={
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="worker-name">{t("fieldWorkersFieldName")}</Label>
              <Input
                id="worker-name"
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="worker-company">{t("fieldWorkersFieldCompany")}</Label>
              <NativeSelect
                id="worker-company"
                value={companyId}
                onChange={(event) => {
                  setCompanyId(event.target.value);
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
            <div className="space-y-1.5">
              <Label htmlFor="worker-service-types">{t("fieldWorkersFieldServiceTypes")}</Label>
              <select
                id="worker-service-types"
                multiple
                className="border-input bg-card h-28 w-full rounded-md border px-2 py-1 text-sm"
                value={selectedServiceTypeIds}
                onChange={(event) => {
                  setSelectedServiceTypeIds(
                    Array.from(event.target.selectedOptions, (option) => option.value),
                  );
                }}
              >
                {serviceTypes?.map((serviceType) => (
                  <option key={serviceType.id} value={serviceType.id}>
                    {serviceType.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="worker-linked-user">{t("fieldWorkersFieldLinkedUser")}</Label>
              <NativeSelect
                id="worker-linked-user"
                value={linkedUserId}
                onChange={(event) => {
                  setLinkedUserId(event.target.value);
                }}
              >
                <NativeSelectOption value="">{t("fieldWorkersNoLinkedUser")}</NativeSelectOption>
                {linkableUsers?.map((user) => (
                  <NativeSelectOption key={user.id} value={user.id}>
                    {user.name} — {user.email}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" className="w-full">
              {t("fieldWorkersSubmitCreate")}
            </Button>
          </form>
        }
      />
    </Page>
  );
}
