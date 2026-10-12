import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { RegistryLayout, RegistryList } from "@/components/layout/Registry";

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
    <Page>
      <PageHeader title={t("contractorCompaniesPageTitle")} />
      <RegistryLayout
        list={
          <RegistryList
            items={companies}
            getKey={(company) => company.id}
            renderItem={(company) => (
              <>
                <span className="text-foreground min-w-0 flex-1 font-semibold">{company.name}</span>
                <span className="text-muted-foreground text-sm">{company.cnpj}</span>
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
              <Label htmlFor="company-name">{t("contractorCompaniesFieldName")}</Label>
              <Input
                id="company-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-cnpj">{t("contractorCompaniesFieldCnpj")}</Label>
              <Input
                id="company-cnpj"
                value={cnpj}
                onChange={(event) => {
                  setCnpj(event.target.value);
                }}
              />
            </div>
            <Button type="submit" className="w-full">
              {t("contractorCompaniesSubmitCreate")}
            </Button>
          </form>
        }
      />
    </Page>
  );
}
