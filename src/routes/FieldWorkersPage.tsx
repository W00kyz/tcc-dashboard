import { useQuery } from "@tanstack/react-query";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Page, PageHeader } from "@/components/layout/Page";
import { RegistryList } from "@/components/layout/Registry";
import { useTranslation } from "@/i18n/useTranslation";

// Workers sign themselves up from the app and the manager approves them (spec 2026-10-20 §8.3);
// the hand-made create/edit dialog went with POST/PATCH /field-workers. Until the approval
// screen lands this page only lists who is registered.
export function FieldWorkersPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  // Mirrors RouteBoardPage/UsersPage/ContractorCompaniesPage's convention: fall back to an
  // empty token instead of asserting a non-null session, so the page renders (and its request
  // fails cleanly) even before the session has hydrated from storage.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data: workers } = useQuery({
    queryKey: ["field-workers"],
    queryFn: async () => {
      const { data, response } = await client.GET("/field-workers");
      if (!response.ok || data === undefined) {
        throw new Error(`GET /field-workers failed with status ${String(response.status)}.`);
      }

      return data;
    },
  });

  return (
    <Page>
      <PageHeader title={t("fieldWorkersPageTitle")} />
      <RegistryList
        items={workers}
        getKey={(worker) => worker.id}
        renderItem={(worker) => (
          <>
            <span className="text-foreground min-w-0 flex-1 font-semibold">{worker.full_name}</span>
            <span className="text-muted-foreground text-sm">{worker.contractor_company_name}</span>
          </>
        )}
      />
    </Page>
  );
}
