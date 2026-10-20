import { Pencil } from "lucide-react";
import { useState } from "react";

import { ErrorMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";

/**
 * Shared plumbing for the registry (Cadastros) forms. Before it, every create form posted
 * whatever was typed and never looked at the response: an empty form either created a blank
 * record (the backend accepts empty names) or failed with a 422 nobody saw. Each page keeps
 * its own fields; this module owns "what is missing", "did it save" and "am I editing".
 */

/** A save that came back non-2xx. `status` picks the message (409 = duplicate). */
export class RegistrySaveError extends Error {
  constructor(
    readonly status: number,
    request: string,
  ) {
    super(`${request} failed with status ${String(status)}; expected a 2xx response.`);
    this.name = "RegistrySaveError";
  }
}

/** openapi-fetch never rejects on a 4xx/5xx — call this after every registry write.
 * @example assertSaved(response, "POST /buildings") */
export function assertSaved(response: Response, request: string): void {
  if (!response.ok) {
    throw new RegistrySaveError(response.status, request);
  }
}

export type FormValues = Record<string, string>;

export interface RegistryForm<Values extends FormValues> {
  values: Values;
  editingId: string | null;
  missing: (keyof Values)[];
  setField: (field: keyof Values, value: string) => void;
  isInvalid: (field: keyof Values) => boolean;
  startEdit: (id: string, values: Values) => void;
  reset: () => void;
  /** True when the form may be sent; otherwise flags the missing fields on screen. */
  validate: () => boolean;
}

/**
 * Field state for one registry form, all values as strings (numbers are parsed on submit).
 * @example const form = useRegistryForm({ name: "", cnpj: "" }, ["name", "cnpj"]);
 */
export function useRegistryForm<Values extends FormValues>(
  empty: Values,
  required: (keyof Values)[],
): RegistryForm<Values> {
  const [values, setValues] = useState<Values>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const missing = required.filter((field) => values[field]?.trim() === "");

  return {
    values,
    editingId,
    missing,
    setField: (field, value) => {
      setValues((current) => ({ ...current, [field]: value }));
    },
    isInvalid: (field) => showMissing && missing.includes(field),
    startEdit: (id, next) => {
      setEditingId(id);
      setValues(next);
      setShowMissing(false);
    },
    reset: () => {
      setEditingId(null);
      setValues(empty);
      setShowMissing(false);
    },
    validate: () => {
      setShowMissing(missing.length > 0);

      return missing.length === 0;
    },
  };
}

export interface SaveState {
  isPending: boolean;
  error: Error | null;
  reset: () => void;
}

interface RegistryFormFooterProps<Values extends FormValues> {
  form: RegistryForm<Values>;
  save: SaveState;
  // The user-facing name of every required field, to list what is still blank.
  fieldLabels: Partial<Record<keyof Values, string>>;
  createLabel: string;
  // Extra blocking problems the page checks itself (e.g. latitude out of range).
  problems?: string[];
}

type RegistryFormErrorsProps<Values extends FormValues> = Pick<
  RegistryFormFooterProps<Values>,
  "form" | "save" | "fieldLabels" | "problems"
> & {
  /** A page's own sentence for a failure it understands; null falls back to the generic one. */
  saveErrorMessage?: (error: Error) => string | null;
};

/** What blocks or failed the save: missing fields, the page's own problems, the server's no. */
export function RegistryFormErrors<Values extends FormValues>({
  form,
  save,
  fieldLabels,
  problems = [],
  saveErrorMessage,
}: RegistryFormErrorsProps<Values>) {
  const { t } = useTranslation();
  const missingLabels = form.missing
    .filter((field) => form.isInvalid(field))
    .map((field) => fieldLabels[field] ?? String(field));
  const ownMessage = save.error === null ? null : (saveErrorMessage?.(save.error) ?? null);
  const genericFailure =
    save.error instanceof RegistrySaveError && save.error.status === 409
      ? t("registrySaveConflict")
      : t("registrySaveError");
  const saveFailure = ownMessage ?? genericFailure;

  return (
    <>
      {missingLabels.length > 0 && (
        <ErrorMessage>
          {t("registryMissingFields").replace("{fields}", missingLabels.join(", "))}
        </ErrorMessage>
      )}
      {problems.map((problem) => (
        <ErrorMessage key={problem}>{problem}</ErrorMessage>
      ))}
      {save.error !== null && <ErrorMessage>{saveFailure}</ErrorMessage>}
    </>
  );
}

/** Error lines, the submit button (create or save) and, while editing, a way back out. */
export function RegistryFormFooter<Values extends FormValues>({
  form,
  save,
  fieldLabels,
  createLabel,
  problems = [],
}: RegistryFormFooterProps<Values>) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <RegistryFormErrors form={form} save={save} fieldLabels={fieldLabels} problems={problems} />
      <Button type="submit" className="w-full" disabled={save.isPending}>
        {form.editingId === null ? createLabel : t("registrySubmitEdit")}
      </Button>
      {form.editingId !== null && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            form.reset();
            save.reset();
          }}
        >
          {t("registryCancelEdit")}
        </Button>
      )}
    </div>
  );
}

/** The per-row "Editar" action; the accessible name says which record. */
export function RegistryEditButton({ itemName, onEdit }: { itemName: string; onEdit: () => void }) {
  const { t } = useTranslation();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={t("registryEditItem").replace("{name}", itemName)}
      onClick={onEdit}
    >
      <Pencil aria-hidden="true" />
      {t("registryEdit")}
    </Button>
  );
}
