import type { components } from "@/api/generated/schema";
import type { StringKey } from "@/i18n/strings";

export type AppealReason = components["schemas"]["AppealReason"];

/** The worker's reason for an appeal (spec 2026-10-20-alocacao-automatica §5.4), in pt-BR.
 * @example t(APPEAL_REASON_LABEL_KEY.NO_SIGNAL) // "Fiquei sem sinal" */
export const APPEAL_REASON_LABEL_KEY: Record<AppealReason, StringKey> = {
  NO_SIGNAL: "appealReasonNoSignal",
  LEFT_BRIEFLY: "appealReasonLeftBriefly",
  APP_CLOSED: "appealReasonAppClosed",
  OTHER: "appealReasonOther",
};
