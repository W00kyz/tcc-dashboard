import type { components } from "@/api/generated/schema";
import type { StringKey } from "@/i18n/strings";

export type ReleaseReason = components["schemas"]["ReleaseReason"];

/** Why a stop went back to the pool (spec 2026-10-20-alocacao-automatica §7), in pt-BR.
 * Shared by the board's stop strip, the execution drawer and the appeals.
 * @example t(RELEASE_REASON_LABEL_KEY.LEFT_CAMPUS) // "Saiu do campus" */
export const RELEASE_REASON_LABEL_KEY: Record<ReleaseReason, StringKey> = {
  IMPEDIMENT: "releaseReasonImpediment",
  ROUTE_REMAINDER: "releaseReasonRouteRemainder",
  LEFT_CAMPUS: "releaseReasonLeftCampus",
  LOCATION_SILENCE: "releaseReasonLocationSilence",
  END_OF_DAY: "releaseReasonEndOfDay",
};
