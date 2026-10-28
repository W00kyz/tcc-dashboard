import type { components } from "@/api/generated/schema";
import type { StringKey } from "@/i18n/strings";

type CompanyServiceTypeOut = components["schemas"]["CompanyServiceTypeOut"];
type ServiceTypeRow = components["schemas"]["ServiceTypeRow"];

const DEFAULT_MINUTES = "30";

/** One editable line of the company dialog. `id` is null until the server creates the type;
 * `key` is only for React, so a line keeps its inputs when another one is removed. */
export interface ServiceTypeDraft {
  key: number;
  id: string | null;
  name: string;
  minutes: string;
  requiresEvidence: boolean;
}

let nextKey = 0;

/** A line for a type that already exists (the company's own, or an orphan being adopted). */
export function draftFromType(type: CompanyServiceTypeOut): ServiceTypeDraft {
  nextKey += 1;

  return {
    key: nextKey,
    id: type.id,
    name: type.name,
    minutes: String(type.average_duration_minutes),
    requiresEvidence: type.requires_evidence,
  };
}

/** A blank line for a type to be created. */
export function blankDraft(): ServiceTypeDraft {
  nextKey += 1;

  return { key: nextKey, id: null, name: "", minutes: DEFAULT_MINUTES, requiresEvidence: false };
}

function minutesOf(draft: ServiceTypeDraft): number {
  return Number(draft.minutes);
}

/** Every line has a name and a whole number of minutes above zero. */
export function draftsAreValid(drafts: ServiceTypeDraft[]): boolean {
  return drafts.every(
    (draft) =>
      draft.name.trim() !== "" && Number.isInteger(minutesOf(draft)) && minutesOf(draft) > 0,
  );
}

/** The whole set the API reconciles: a type left out of it is removed. */
export function toServiceTypeRows(drafts: ServiceTypeDraft[]): ServiceTypeRow[] {
  return drafts.map((draft) => ({
    id: draft.id,
    name: draft.name.trim(),
    average_duration_minutes: minutesOf(draft),
    requires_evidence: draft.requiresEvidence,
  }));
}

const CONFLICT_MESSAGES = {
  SERVICE_TYPE_IN_USE: "serviceTypeInUse",
  SERVICE_TYPE_HAS_HISTORY: "serviceTypeHasHistory",
  SERVICE_TYPE_OF_ANOTHER_COMPANY: "serviceTypeOfAnotherCompany",
  SERVICE_TYPE_NAME_TAKEN: "serviceTypeNameTaken",
} as const satisfies Record<string, StringKey>;

type ConflictCode = keyof typeof CONFLICT_MESSAGES;

/** A 409 the company save refused for one of its service types; nothing changed server-side. */
export class ServiceTypeConflictError extends Error {
  constructor(
    readonly code: ConflictCode,
    readonly serviceTypeId: string | null,
    readonly points: number,
  ) {
    super(`Company save refused with ${code}; expected the dialog to explain it.`);
    this.name = "ServiceTypeConflictError";
  }
}

function isConflictCode(code: unknown): code is ConflictCode {
  return typeof code === "string" && code in CONFLICT_MESSAGES;
}

/** The service-type conflict in an error body (`{detail: {code, ...}}`), or null for any other. */
export function readServiceTypeConflict(body: unknown): ServiceTypeConflictError | null {
  const detail = (body as { detail?: Record<string, unknown> } | null | undefined)?.detail;
  if (typeof detail !== "object" || !isConflictCode(detail.code)) {
    return null;
  }
  const id = typeof detail.service_type_id === "string" ? detail.service_type_id : null;
  const points = typeof detail.points === "number" ? detail.points : 0;

  return new ServiceTypeConflictError(detail.code, id, points);
}

/** The pt-BR sentence for a conflict, naming the type among `known` (the company's types
 * before the edit plus the lines now in the dialog). */
export function conflictMessage(
  error: ServiceTypeConflictError,
  known: { id: string; name: string }[],
  t: (key: StringKey) => string,
): string {
  const name = known.find((type) => type.id === error.serviceTypeId)?.name ?? "";
  const key =
    error.code === "SERVICE_TYPE_IN_USE" && error.points === 1
      ? "serviceTypeInUseOne"
      : CONFLICT_MESSAGES[error.code];

  return t(key).replace("{name}", name).replace("{n}", String(error.points));
}
