import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { useTranslation } from "@/i18n/useTranslation";

// The dashboard has no navigation shell — pages are reachable only by URL (Etapa 4 review).
// Spec §7.1 asks for a minimal one so the ADMIN-only /configuracoes route is discoverable;
// this is that minimum, not a full app shell.
const LINK_CLASS =
  "text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground text-sm aria-[current=page]:font-medium";

const PENDING_REVIEW_QUERY = "review_status=PENDING_REVIEW";

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
    enabled: session !== null,
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
      <nav className="mx-auto flex max-w-6xl items-center gap-4 p-4">
        <NavLink to="/rotas" className={LINK_CLASS}>
          {t("navRoutes")}
        </NavLink>
        <NavLink to="/templates-de-rota" className={LINK_CLASS}>
          {t("navRouteTemplates")}
        </NavLink>
        {canManage && (
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
        )}
        {canManage && (
          <NavLink to="/reatribuicoes" className={LINK_CLASS}>
            {t("navReassignments")}
          </NavLink>
        )}
        {canManage && (
          <NavLink to="/regras-de-alerta" className={LINK_CLASS}>
            {t("navAlertRules")}
          </NavLink>
        )}
        {session.role === "ADMIN" && (
          <NavLink to="/formularios" className={LINK_CLASS}>
            {t("navForms")}
          </NavLink>
        )}
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
        {session.role === "ADMIN" && (
          <NavLink to="/configuracoes" className={LINK_CLASS}>
            {t("navSettings")}
          </NavLink>
        )}
      </nav>
    </header>
  );
}
