import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

interface ContractorCompanyRow {
  id: string;
  name: string;
  cnpj: string;
}

export function ContractorCompaniesPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors RouteBoardPage/UsersPage's convention: fall back to an empty token instead of
  // asserting a non-null session, so the page renders (and its request fails cleanly)
  // even before the session has hydrated from storage, rather than crashing on mount.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data: companies } = useQuery({
    queryKey: ["contractor-companies"],
    queryFn: async () => {
      const { data } = await client.GET("/contractor-companies");

      return data as ContractorCompanyRow[];
    },
  });

  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      await client.POST("/contractor-companies", { body: { name, cnpj } });
    },
    onSuccess: () => {
      setName("");
      setCnpj("");
      void queryClient.invalidateQueries({ queryKey: ["contractor-companies"] });
    },
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("contractorCompaniesPageTitle")}</h1>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <Label htmlFor="company-name">{t("contractorCompaniesFieldName")}</Label>
          <Input
            id="company-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="company-cnpj">{t("contractorCompaniesFieldCnpj")}</Label>
          <Input
            id="company-cnpj"
            value={cnpj}
            onChange={(event) => {
              setCnpj(event.target.value);
            }}
          />
        </div>
        <Button type="submit">{t("contractorCompaniesSubmitCreate")}</Button>
      </form>
      <ul className="divide-border divide-y">
        {companies?.map((company) => (
          <li key={company.id} className="py-2">
            <span className="font-medium">{company.name}</span>{" "}
            <span className="text-muted-foreground">{company.cnpj}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
