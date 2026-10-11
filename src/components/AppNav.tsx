import { useQuery } from "@tanstack/react-query";
import { NavLink, useNavigate } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { useTranslation } from "@/i18n/useTranslation";
import type { StringKey } from "@/i18n/strings";

// The dashboard's only navigation shell (spec §7.1). Two rows: day-to-day operation on top,
// registries ("Cadastros") below — before this every registry page (RF05-RF08, RF22) was
// reachable only by typing its URL.
const LINK_CLASS =
  "text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground text-sm aria-[current=page]:font-medium";

const PENDING_REVIEW_QUERY = "review_status=PENDING_REVIEW";

interface NavEntry {
  to: string;
  label: StringKey;
}

const REGISTRY_LINKS: NavEntry[] = [
  { to: "/pontos-de-servico", label: "navServicePoints" },
  { to: "/predios", label: "navBuildings" },
  { to: "/eventos", label: "navEvents" },
  { to: "/profissionais", label: "navFieldWorkers" },
  { to: "/empresas-terceirizadas", label: "navContractorCompanies" },
  { to: "/tipos-de-servico", label: "navServiceTypes" },
  { to: "/formularios", label: "navForms" },
];

function NavLinks({ entries }: { entries: NavEntry[] }) {
  const { t } = useTranslation();

  return entries.map((entry) => (
    <NavLink key={entry.to} to={entry.to} className={LINK_CLASS}>
      {t(entry.label)}
    </NavLink>
  ));
}

function LogoutButton() {
  const { t } = useTranslation();
  const { session, clearSession } = useAuth();
  const navigate = useNavigate();

  const logout = async () => {
    // RF04: the API records the logout in auth_logs. Best effort — the local session is
    // dropped whatever the network says.
    try {
      await createApiClient(apiBaseUrl, session?.accessToken ?? "").POST("/auth/logout");
    } catch {
      // Offline or already expired: nothing else to do.
    }
    clearSession();
    void navigate("/entrar", { replace: true });
  };

  return (
    <button type="button" className={LINK_CLASS} onClick={() => void logout()}>
      {t("navLogout")}
    </button>
  );
}

export function AppNav() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const canManage = session?.role === "MANAGER" || session?.role === "ADMIN";

  const { data: unreadNotificationCount } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => {
      const { data } = await client.GET("/notifications/me/unread-count");

      return data?.count ?? 0;
    },
    // SSE stand-in: poll so the badge tracks new notifications without a manual refresh.
    refetchInterval: 30_000,
    enabled: canManage,
  });

  const { data: pendingReviewCount } = useQuery({
    queryKey: ["executions", "review-count"],
    queryFn: async () => {
      const { data } = await client.GET("/executions", {
        params: { query: { review_status: "PENDING_REVIEW", page_size: 1 } },
      });

      return data?.total ?? 0;
    },
    enabled: canManage,
  });

  if (session === null) {
    return null;
  }

  return (
    <header className="border-b">
      <nav className="mx-auto max-w-6xl space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {canManage && (
            <>
              <NavLink to="/rotas" className={LINK_CLASS}>
                {t("navRoutes")}
              </NavLink>
              <NavLink to="/templates-de-rota" className={LINK_CLASS}>
                {t("navRouteTemplates")}
              </NavLink>
              <span className="flex items-center gap-1.5">
                <NavLink to="/execucoes" className={LINK_CLASS}>
                  {t("navExecutions")}
                </NavLink>
                {pendingReviewCount !== undefined && pendingReviewCount > 0 && (
                  <NavLink
                    to={`/execucoes?${PENDING_REVIEW_QUERY}`}
                    aria-label={t("navReviewQueueBadgeAria")}
                    className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                  >
                    {pendingReviewCount}
                  </NavLink>
                )}
              </span>
              <NavLink to="/reatribuicoes" className={LINK_CLASS}>
                {t("navReassignments")}
              </NavLink>
              <NavLink to="/regras-de-alerta" className={LINK_CLASS}>
                {t("navAlertRules")}
              </NavLink>
              <NavLink to="/relatorios" className={LINK_CLASS}>
                {t("navReports")}
              </NavLink>
              <span className="flex items-center gap-1.5">
                <NavLink to="/notificacoes" className={LINK_CLASS}>
                  {t("navNotifications")}
                </NavLink>
                {unreadNotificationCount !== undefined && unreadNotificationCount > 0 && (
                  <NavLink
                    to="/notificacoes"
                    aria-label={t("navNotificationsBadgeAria")}
                    className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                  >
                    {unreadNotificationCount}
                  </NavLink>
                )}
              </span>
            </>
          )}
          <span className="ml-auto flex items-center gap-4">
            <NavLink to="/meus-dados" className={LINK_CLASS}>
              {t("navMyData")}
            </NavLink>
            <LogoutButton />
          </span>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("navGroupRegistry")}
            </span>
            <NavLinks entries={REGISTRY_LINKS} />
            {session.role === "ADMIN" && (
              <NavLinks
                entries={[
                  { to: "/usuarios", label: "navUsers" },
                  { to: "/configuracoes", label: "navSettings" },
                ]}
              />
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
