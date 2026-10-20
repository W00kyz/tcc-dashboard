import {
  Bell,
  Building2,
  ClipboardCheck,
  FileBarChart,
  FileText,
  HardHat,
  Handshake,
  LayoutList,
  type LucideIcon,
  Settings,
  ShieldAlert,
  Users,
} from "lucide-react";

import type { Session } from "@/auth/AuthContext";
import type { StringKey } from "@/i18n/strings";

export type NavBadgeKind = "reviewQueue";

export interface NavEntry {
  to: string;
  label: StringKey;
  icon: LucideIcon;
  badge?: NavBadgeKind;
}

export interface NavModule {
  id: "operation" | "planning" | "registry" | "admin";
  label: StringKey;
  entries: NavEntry[];
  // Daily work stays expanded; the rest folds away so the sidebar never shows twenty links
  // at once. A collapsed module still opens by itself when the current page lives in it.
  defaultOpen: boolean;
  roles: Session["role"][];
}

const MANAGEMENT_ROLES: Session["role"][] = ["MANAGER", "ADMIN"];

// Modules group pages by the manager's job, not by API resource (PRODUCT.md, principle 3).
export const NAV_MODULES: NavModule[] = [
  {
    id: "operation",
    label: "navGroupOperation",
    defaultOpen: true,
    roles: MANAGEMENT_ROLES,
    entries: [
      { to: "/rotas", label: "navRouteBoard", icon: LayoutList },
      { to: "/execucoes", label: "navExecutions", icon: ClipboardCheck, badge: "reviewQueue" },
      { to: "/relatorios", label: "navReports", icon: FileBarChart },
    ],
  },
  {
    id: "planning",
    label: "navGroupPlanning",
    defaultOpen: false,
    roles: MANAGEMENT_ROLES,
    entries: [
      { to: "/regras-de-alerta", label: "navAlertRules", icon: ShieldAlert },
      { to: "/formularios", label: "navForms", icon: FileText },
    ],
  },
  {
    id: "registry",
    label: "navGroupRegistry",
    defaultOpen: false,
    roles: MANAGEMENT_ROLES,
    entries: [
      { to: "/predios", label: "navBuildings", icon: Building2 },
      { to: "/profissionais", label: "navFieldWorkers", icon: HardHat },
      { to: "/empresas-terceirizadas", label: "navContractorCompanies", icon: Handshake },
    ],
  },
  {
    id: "admin",
    label: "navGroupAdmin",
    defaultOpen: false,
    roles: ["ADMIN"],
    entries: [
      { to: "/usuarios", label: "navUsers", icon: Users },
      { to: "/configuracoes", label: "navSettings", icon: Settings },
    ],
  },
];

export const MY_DATA_ENTRY: NavEntry = { to: "/meus-dados", label: "navMyData", icon: Users };

// Personal pages reached from the header or the account menu, not listed in a module. They
// still need a breadcrumb, so they resolve under "Conta".
const ACCOUNT_ENTRIES: NavEntry[] = [
  MY_DATA_ENTRY,
  // The inbox lives in the header bell (top right); the sidebar no longer lists it.
  { to: "/notificacoes", label: "navNotifications", icon: Bell },
];

/** Modules a role may see, in sidebar order. Example: `modulesForRole("MANAGER")`. */
export function modulesForRole(role: Session["role"]): NavModule[] {
  return NAV_MODULES.filter((module) => module.roles.includes(role));
}

function entryMatches(entry: NavEntry, pathname: string): boolean {
  return pathname === entry.to || pathname.startsWith(`${entry.to}/`);
}

/**
 * The module and entry the current path belongs to, for the breadcrumb and for opening the
 * right module. Nested paths (old links such as `/predios/:id`) resolve to their parent
 * entry. Example: `findActiveNav("/predios/b1")` → Cadastros / Prédios e pontos.
 */
export function findActiveNav(
  pathname: string,
): { module: NavModule | null; entry: NavEntry } | null {
  const accountEntry = ACCOUNT_ENTRIES.find((entry) => entryMatches(entry, pathname));
  if (accountEntry) {
    return { module: null, entry: accountEntry };
  }
  for (const module of NAV_MODULES) {
    const entry = module.entries.find((candidate) => entryMatches(candidate, pathname));
    if (entry) {
      return { module, entry };
    }
  }

  return null;
}
