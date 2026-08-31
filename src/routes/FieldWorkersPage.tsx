import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

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
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("fieldWorkersPageTitle")}</h1>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <Label htmlFor="worker-name">{t("fieldWorkersFieldName")}</Label>
          <Input
            id="worker-name"
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="worker-company">{t("fieldWorkersFieldCompany")}</Label>
          <select
            id="worker-company"
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={companyId}
            onChange={(event) => {
              setCompanyId(event.target.value);
            }}
          >
            <option value="" />
            {companies?.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="worker-service-types">{t("fieldWorkersFieldServiceTypes")}</Label>
          <select
            id="worker-service-types"
            multiple
            className="border-input h-24 w-full rounded-md border bg-transparent px-3 text-sm"
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
        <div>
          <Label htmlFor="worker-linked-user">{t("fieldWorkersFieldLinkedUser")}</Label>
          <select
            id="worker-linked-user"
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={linkedUserId}
            onChange={(event) => {
              setLinkedUserId(event.target.value);
            }}
          >
            <option value="">{t("fieldWorkersNoLinkedUser")}</option>
            {linkableUsers?.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} — {user.email}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">{t("fieldWorkersSubmitCreate")}</Button>
      </form>
      <ul className="divide-border divide-y">
        {workers?.map((worker) => (
          <li key={worker.id} className="py-2">
            <span className="font-medium">{worker.full_name}</span>{" "}
            <span className="text-muted-foreground">
              {companyName(worker.contractor_company_id)}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
