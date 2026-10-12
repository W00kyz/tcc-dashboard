import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Page, PageHeader, Panel } from "@/components/layout/Page";
import { ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";

// RNF10: a user whose consent is pending cannot reach any protected route until they
// accept the current privacy notice. Wraps each ProtectedRoute branch in App.tsx — it
// gates, it does not replace, so `children` (the ProtectedRoute) still renders once
// consent is settled.
export function ConsentGate({ children }: { children: ReactNode }) {
  const { session, setSession } = useAuth();
  const { t } = useTranslation();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const consentPending = Boolean(session?.consentRequired);

  const notice = useQuery({
    queryKey: ["consent-status"],
    queryFn: async () => {
      const { data, response } = await client.GET("/auth/consent-status");
      if (!response.ok || !data) {
        throw new Error(`GET /auth/consent-status failed (${String(response.status)}).`);
      }

      return data;
    },
    enabled: consentPending,
  });

  const accept = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/auth/consent");
      if (!response.ok) {
        throw new Error(`POST /auth/consent failed (${String(response.status)}).`);
      }
    },
    onSuccess: () => {
      if (session) {
        setSession({ ...session, consentRequired: false });
      }
    },
  });

  // No session, or the local flag says consent is settled — nothing to gate. The
  // server-side check on the next login keeps the local flag honest.
  if (!consentPending) {
    return <>{children}</>;
  }

  // The stored flag was stale: the API says this user is already up to date.
  if (notice.data && !notice.data.consent_required) {
    return <>{children}</>;
  }

  return (
    <div className="bg-background min-h-screen">
      <Page width="narrow">
        <PageHeader title={notice.data?.notice?.title ?? t("consentGateTitle")} />

        {notice.isLoading && <LoadingMessage>{t("consentGateBodyLoading")}</LoadingMessage>}

        {notice.data?.notice && (
          <Panel className="p-6">
            {/* No markdown renderer in the dashboard and RNF10 does not warrant a new
             * dependency — the notice body reads fine as pre-wrapped prose. */}
            <pre className="max-w-[70ch] font-sans text-sm leading-relaxed whitespace-pre-wrap">
              {notice.data.notice.body_markdown}
            </pre>
          </Panel>
        )}

        {(notice.isError || accept.isError) && <ErrorMessage>{t("consentGateError")}</ErrorMessage>}

        <div>
          <Button
            size="lg"
            disabled={accept.isPending || notice.isLoading}
            onClick={() => {
              accept.mutate();
            }}
          >
            {accept.isPending ? t("consentGateAcceptPending") : t("consentGateAccept")}
          </Button>
        </div>
      </Page>
    </div>
  );
}
