import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Page, PageHeader } from "@/components/layout/Page";
import { Field, RegistryList, RegistryNewButton } from "@/components/layout/Registry";
import { RegistryDialog, useRegistryDialog } from "@/components/layout/RegistryDialog";
import { assertSaved, RegistryEditButton } from "@/components/layout/registryForm";
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

  const dialog = useRegistryDialog({ name: "", cnpj: "" }, ["name", "cnpj"]);
  const { form } = dialog;

  const save = useMutation({
    mutationFn: async () => {
      const body = { name: form.values.name.trim(), cnpj: form.values.cnpj.trim() };
      if (form.editingId !== null) {
        const { response } = await client.PATCH("/contractor-companies/{company_id}", {
          params: { path: { company_id: form.editingId } },
          body,
        });
        assertSaved(response, `PATCH /contractor-companies/${form.editingId}`);

        return;
      }
      const { response } = await client.POST("/contractor-companies", { body });
      assertSaved(response, "POST /contractor-companies");
    },
    onSuccess: () => {
      dialog.close();
      void queryClient.invalidateQueries({ queryKey: ["contractor-companies"] });
    },
  });

  return (
    <Page>
      <PageHeader
        title={t("contractorCompaniesPageTitle")}
        actions={
          <RegistryNewButton
            label={t("contractorCompaniesNew")}
            onClick={() => {
              save.reset();
              dialog.openNew();
            }}
          />
        }
      />
      <RegistryList
        items={companies}
        getKey={(company) => company.id}
        renderItem={(company) => (
          <>
            <span className="text-foreground min-w-0 flex-1 font-semibold">{company.name}</span>
            <span className="text-muted-foreground text-sm">{company.cnpj}</span>
            <RegistryEditButton
              itemName={company.name}
              onEdit={() => {
                save.reset();
                dialog.openEdit(company.id, { name: company.name, cnpj: company.cnpj });
              }}
            />
          </>
        )}
      />
      <RegistryDialog
        dialog={dialog}
        save={save}
        onSubmit={() => {
          save.mutate();
        }}
        createLabel={t("contractorCompaniesSubmitCreate")}
        fieldLabels={{
          name: t("contractorCompaniesFieldName"),
          cnpj: t("contractorCompaniesFieldCnpj"),
        }}
      >
        <Field>
          <Label htmlFor="company-name">{t("contractorCompaniesFieldName")}</Label>
          <Input
            id="company-name"
            value={form.values.name}
            aria-invalid={form.isInvalid("name")}
            onChange={(event) => {
              form.setField("name", event.target.value);
            }}
          />
        </Field>
        <Field>
          <Label htmlFor="company-cnpj">{t("contractorCompaniesFieldCnpj")}</Label>
          <Input
            id="company-cnpj"
            value={form.values.cnpj}
            aria-invalid={form.isInvalid("cnpj")}
            onChange={(event) => {
              form.setField("cnpj", event.target.value);
            }}
          />
        </Field>
      </RegistryDialog>
    </Page>
  );
}
