import type { Session } from "@/auth/AuthContext";
import type { StringKey } from "@/i18n/strings";

/** The pt-BR name of each access profile. One map for the sidebar, Usuários and Meus dados —
 * there used to be two, and they disagreed on "Profissional de Campo/campo".
 * @example t(ROLE_LABEL_KEY.ADMIN) // "Administrador" */
export const ROLE_LABEL_KEY: Record<Session["role"], StringKey> = {
  MANAGER: "roleLabelManager",
  ADMIN: "roleLabelAdmin",
  FIELD_WORKER: "roleLabelFieldWorker",
};

/** Raw API roles outside the known set are shown as they come instead of crashing. */
export function roleLabelKey(role: string): StringKey | null {
  return role in ROLE_LABEL_KEY ? ROLE_LABEL_KEY[role as Session["role"]] : null;
}
