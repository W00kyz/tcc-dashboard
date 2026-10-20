import { ChevronRight } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { HeaderNotifications } from "@/components/notifications/HeaderNotifications";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { findActiveNav } from "@/components/shell/navModules";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useTranslation } from "@/i18n/useTranslation";

function ShellBreadcrumb() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const active = findActiveNav(pathname);
  if (active === null) {
    return null;
  }

  const moduleLabel = active.module ? t(active.module.label) : t("navGroupAccount");

  return (
    <nav aria-label={t("navBreadcrumbLabel")} className="min-w-0">
      <ol className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <li className="hidden sm:block">{moduleLabel}</li>
        <li aria-hidden="true" className="hidden sm:block">
          <ChevronRight className="size-3.5" />
        </li>
        {/* Creating and editing happen in Dialogs: every page is a nav entry, so the trail
            stops at it (spec 2026-10-20 §2). */}
        <li aria-current="page" className="text-foreground truncate font-semibold">
          {t(active.entry.label)}
        </li>
      </ol>
    </nav>
  );
}

/**
 * Pathless layout route (spec §7.1): the sidebar shell for signed-in pages. Without a session
 * it renders the page bare, so /entrar and the password pages keep their full-screen layout.
 */
export function AppShell() {
  const { session } = useAuth();
  if (session === null) {
    return <Outlet />;
  }

  return (
    <SidebarProvider>
      <AppSidebar role={session.role} />
      <SidebarInset className="bg-background min-w-0">
        <header className="bg-background/95 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-sm md:px-8">
          <SidebarTrigger className="-ml-1.5" />
          <ShellBreadcrumb />
          {/* Field workers have no notification inbox on the panel (only "Meus dados"). */}
          {session.role !== "FIELD_WORKER" && (
            <div className="ml-auto flex items-center">
              <HeaderNotifications />
            </div>
          )}
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
