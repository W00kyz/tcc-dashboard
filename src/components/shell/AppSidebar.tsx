import { ChevronRight, LogOut, UserRound } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { type Session, useAuth } from "@/auth/AuthContext";
import {
  findActiveNav,
  MY_DATA_ENTRY,
  modulesForRole,
  type NavBadgeKind,
  type NavEntry,
  type NavModule,
} from "@/components/shell/navModules";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { useReviewQueueCount } from "@/hooks/useReviewQueueCount";

const PENDING_REVIEW_QUERY = "review_status=PENDING_REVIEW";

// The active page reads as a white sign plate on the blue rail.
const ACTIVE_ITEM_CLASS =
  "data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:font-semibold";

const ROLE_LABEL: Record<Session["role"], StringKey> = {
  MANAGER: "roleLabelManager",
  ADMIN: "roleLabelAdmin",
  FIELD_WORKER: "roleLabelFieldWorker",
};

type BadgeCounts = Record<NavBadgeKind, number | undefined>;

function useBadgeCounts(enabled: boolean): BadgeCounts {
  return { reviewQueue: useReviewQueueCount(enabled) };
}

const BADGE_TARGET: Record<NavBadgeKind, { to: string; aria: StringKey }> = {
  reviewQueue: { to: `/execucoes?${PENDING_REVIEW_QUERY}`, aria: "navReviewQueueBadgeAria" },
};

function CountBadgeLink({ kind, count }: { kind: NavBadgeKind; count: number | undefined }) {
  const { t } = useTranslation();
  const { setOpenMobile } = useSidebar();
  if (count === undefined || count <= 0) {
    return null;
  }

  return (
    <Link
      to={BADGE_TARGET[kind].to}
      aria-label={t(BADGE_TARGET[kind].aria)}
      onClick={() => {
        setOpenMobile(false);
      }}
      className="bg-signal text-signal-foreground focus-visible:outline-sidebar-ring absolute top-1.5 right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs leading-none font-bold"
    >
      {count}
    </Link>
  );
}

function NavItem({ entry, counts }: { entry: NavEntry; counts: BadgeCounts }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const isActive = findActiveNav(pathname)?.entry.to === entry.to;
  const Icon = entry.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} className={`h-9 ${ACTIVE_ITEM_CLASS}`}>
        <NavLink
          to={entry.to}
          onClick={() => {
            setOpenMobile(false);
          }}
        >
          <Icon aria-hidden="true" />
          <span>{t(entry.label)}</span>
        </NavLink>
      </SidebarMenuButton>
      {entry.badge && <CountBadgeLink kind={entry.badge} count={counts[entry.badge]} />}
    </SidebarMenuItem>
  );
}

function NavModuleGroup({ module, counts }: { module: NavModule; counts: BadgeCounts }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const containsActivePage = findActiveNav(pathname)?.module?.id === module.id;

  return (
    // Keyed on the active module so navigating into a folded module (a deep link, the
    // review badge) opens it, while manual toggles still stick between pages.
    <Collapsible
      key={containsActivePage ? "active" : "idle"}
      defaultOpen={module.defaultOpen || containsActivePage}
      className="group/module"
    >
      <SidebarGroup className="py-1">
        <SidebarGroupLabel
          asChild
          className="text-sidebar-muted hover:text-sidebar-foreground h-8 text-[0.6875rem] font-bold tracking-[0.12em] uppercase"
        >
          <CollapsibleTrigger className="w-full">
            {t(module.label)}
            <ChevronRight
              aria-hidden="true"
              className="ml-auto transition-transform duration-200 group-data-[state=open]/module:rotate-90"
            />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {module.entries.map((entry) => (
                <NavItem key={entry.to} entry={entry} counts={counts} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
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
    <SidebarMenuButton className="h-9" onClick={() => void logout()}>
      <LogOut aria-hidden="true" />
      <span>{t("navLogout")}</span>
    </SidebarMenuButton>
  );
}

function SidebarBrand() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 px-2 py-3">
      {/* A building-code plate, the world's signature chip: the PU's own short name. */}
      <span
        aria-hidden="true"
        className="bg-signal text-signal-foreground rounded-[3px] px-1.5 py-0.5 text-sm leading-tight font-extrabold"
      >
        PU
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sidebar-accent-foreground text-base font-bold">
          {t("appBrandName")}
        </span>
        <span className="text-sidebar-muted text-xs">{t("appBrandOrg")}</span>
      </span>
    </div>
  );
}

function AccountMenu({ role }: { role: Session["role"] }) {
  const { t } = useTranslation();
  const counts: BadgeCounts = { reviewQueue: undefined };

  return (
    <>
      <p className="text-sidebar-muted flex items-center gap-2 px-2 pt-1 text-xs">
        <UserRound aria-hidden="true" className="size-3.5" />
        {t(ROLE_LABEL[role])}
      </p>
      <SidebarMenu>
        <NavItem entry={MY_DATA_ENTRY} counts={counts} />
        <SidebarMenuItem>
          <LogoutButton />
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}

/** The dashboard's only navigation (spec §7.1): job modules on a sign-blue rail. */
export function AppSidebar({ role }: { role: Session["role"] }) {
  const { t } = useTranslation();
  const modules = modulesForRole(role);
  const counts = useBadgeCounts(modules.length > 0);

  return (
    <Sidebar>
      <SidebarHeader className="border-sidebar-border border-b">
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent className="gap-0 py-2">
        {/* A real navigation landmark for screen readers; `contents` keeps the sidebar's flex
         * layout as if the wrapper were not there. */}
        <nav aria-label={t("navMainLabel")} className="contents">
          {modules.map((module) => (
            <NavModuleGroup key={module.id} module={module} counts={counts} />
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border border-t">
        <AccountMenu role={role} />
      </SidebarFooter>
    </Sidebar>
  );
}
