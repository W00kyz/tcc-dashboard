import type { components } from "@/api/generated/schema";
import type { StringKey } from "@/i18n/strings";

export type ImpedimentReason = components["schemas"]["ImpedimentReason"];

/** Why a worker could not execute a stop (spec 2026-10-20-alocacao-automatica §7.1), in pt-BR.
 * @example t(IMPEDIMENT_REASON_LABEL_KEY.ACCESS_BLOCKED) // "Acesso bloqueado" */
export const IMPEDIMENT_REASON_LABEL_KEY: Record<ImpedimentReason, StringKey> = {
  ACCESS_BLOCKED: "impedimentReasonAccessBlocked",
  SITE_REFUSAL: "impedimentReasonSiteRefusal",
  HEALTH_ISSUE: "impedimentReasonHealthIssue",
  OTHER: "impedimentReasonOther",
};
