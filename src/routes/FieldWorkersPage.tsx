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
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
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
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data } = await client.GET("/users");

      return data as UserRow[];
    },
  });

  // A user counts as "available for linking" only if their id does not appear as the
  // user_id of ANY existing field worker (not just the one being created here — this
  // page is create-only, there is no "current worker" to exempt from its own link).
  const linkedUserIds = new Set(
    (workers ?? []).map((worker) => worker.user_id).filter((id) => id !== null),
  );
  const availableUsers = (users ?? []).filter(
    (user) => user.role === "FIELD_WORKER" && !linkedUserIds.has(user.id),
  );

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
            {availableUsers.map((user) => (
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
