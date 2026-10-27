import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { useServiceTypes } from "@/components/buildings/useBuildingRecords";
import { ServiceTypeRows } from "@/components/companies/ServiceTypeRows";
import {
  conflictMessage,
  draftFromType,
  draftsAreValid,
  readServiceTypeConflict,
  ServiceTypeConflictError,
  type ServiceTypeDraft,
  toServiceTypeRows,
} from "@/components/companies/serviceTypeRows";
import { Page, PageHeader } from "@/components/layout/Page";
import { Field, RegistryList, RegistryNewButton } from "@/components/layout/Registry";
import { RegistryDialog, useRegistryDialog } from "@/components/layout/RegistryDialog";
import { assertSaved, RegistryEditButton } from "@/components/layout/registryForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

type ContractorCompanyRow = components["schemas"]["ContractorCompanyOut"];

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
  const [drafts, setDrafts] = useState<ServiceTypeDraft[]>([]);
  const [showInvalid, setShowInvalid] = useState(false);
  const orphans = useServiceTypes({ unassigned: true, enabled: dialog.open });
  const editing = companies?.find((company) => company.id === form.editingId);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.values.name.trim(),
        cnpj: form.values.cnpj.trim(),
        service_types: toServiceTypeRows(drafts),
      };
      const request =
        form.editingId === null
          ? "POST /contractor-companies"
          : `PATCH /contractor-companies/${form.editingId}`;
      const { response, error } =
        form.editingId === null
          ? await client.POST("/contractor-companies", { body })
          : await client.PATCH("/contractor-companies/{company_id}", {
              params: { path: { company_id: form.editingId } },
              body,
            });
      const conflict = readServiceTypeConflict(error);
      if (conflict !== null) {
        throw conflict;
      }
      assertSaved(response, request);
    },
    onSuccess: () => {
      dialog.close();
      void queryClient.invalidateQueries({ queryKey: ["contractor-companies"] });
      void queryClient.invalidateQueries({ queryKey: ["service-types"] });
    },
  });

  const openDialog = (company?: ContractorCompanyRow) => {
    save.reset();
    setShowInvalid(false);
    setDrafts(company?.service_types.map(draftFromType) ?? []);
    if (company === undefined) {
      dialog.openNew();

      return;
    }
    dialog.openEdit(company.id, { name: company.name, cnpj: company.cnpj });
  };

  // The names a conflict can point at: the company's types before this edit and the lines now.
  const knownTypes = [
    ...(editing?.service_types ?? []),
    ...drafts.flatMap((draft) => (draft.id === null ? [] : [{ id: draft.id, name: draft.name }])),
  ];

  return (
    <Page>
      <PageHeader
        title={t("contractorCompaniesPageTitle")}
        actions={
          <RegistryNewButton
            label={t("contractorCompaniesNew")}
            onClick={() => {
              openDialog();
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
            <span className="text-muted-foreground text-sm">
              {company.service_types.length === 0
                ? t("contractorCompaniesNoTypes")
                : company.service_types.map((type) => type.name).join(", ")}
            </span>
            <RegistryEditButton
              itemName={company.name}
              onEdit={() => {
                openDialog(company);
              }}
            />
          </>
        )}
      />
      <RegistryDialog
        dialog={dialog}
        save={save}
        onSubmit={() => {
          if (!draftsAreValid(drafts)) {
            setShowInvalid(true);

            return;
          }
          save.mutate();
        }}
        problems={showInvalid ? [t("serviceTypesInvalid")] : []}
        saveErrorMessage={(error) =>
          error instanceof ServiceTypeConflictError ? conflictMessage(error, knownTypes, t) : null
        }
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
        <ServiceTypeRows
          drafts={drafts}
          onChange={(next) => {
            setShowInvalid(false);
            setDrafts(next);
          }}
          orphans={orphans.data ?? []}
          showInvalid={showInvalid}
        />
      </RegistryDialog>
    </Page>
  );
}
