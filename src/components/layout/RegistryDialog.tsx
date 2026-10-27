import { type ReactNode, useState } from "react";

import {
  type FormValues,
  type RegistryForm,
  RegistryFormErrors,
  type SaveState,
  useRegistryForm,
} from "@/components/layout/registryForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/i18n/useTranslation";

export interface RegistryDialogState<Values extends FormValues> {
  form: RegistryForm<Values>;
  open: boolean;
  openNew: (values?: Partial<Values>) => void;
  openEdit: (id: string, values: Values) => void;
  close: () => void;
}

/**
 * The form state of a registry plus whether its Dialog is open. Every create and edit form of
 * the dashboard lives in a Dialog (spec 2026-10-20-predios-pontos-dialogs-design.md §2).
 * @example const dialog = useRegistryDialog({ name: "" }, ["name"]); dialog.openNew();
 */
export function useRegistryDialog<Values extends FormValues>(
  empty: Values,
  required: (keyof Values)[],
): RegistryDialogState<Values> {
  const form = useRegistryForm(empty, required);
  const [open, setOpen] = useState(false);

  return {
    form,
    open,
    openNew: (values = {}) => {
      form.reset();
      // A fresh record can start with fields the page already knows (e.g. the floor in view).
      Object.entries(values).forEach(([field, value]) => {
        form.setField(field, String(value));
      });
      setOpen(true);
    },
    openEdit: (id, values) => {
      form.startEdit(id, values);
      setOpen(true);
    },
    close: () => {
      setOpen(false);
      form.reset();
    },
  };
}

interface RegistryDialogProps<Values extends FormValues> {
  dialog: RegistryDialogState<Values>;
  save: SaveState;
  /** Called once the fields are filled and `problems` is empty. */
  onSubmit: () => void;
  createLabel: string;
  // The user-facing name of every required field, to list what is still blank.
  fieldLabels: Partial<Record<keyof Values, string>>;
  // Extra blocking problems the page checks itself (e.g. a window that ends before it starts).
  problems?: string[];
  /** The page's own sentence for a save failure it understands (null = the generic message). */
  saveErrorMessage?: (error: Error) => string | null;
  /** Overrides "Novo cadastro" / "Editar cadastro". */
  title?: string;
  description?: string;
  children: ReactNode;
}

/** A registry's create/edit form in a Dialog: fields, what blocks the save, Cancelar and the
 * submit button. The page closes it from its mutation's onSuccess (`dialog.close()`). */
export function RegistryDialog<Values extends FormValues>(props: RegistryDialogProps<Values>) {
  const { t } = useTranslation();
  const { dialog, save, problems = [] } = props;
  const editing = dialog.form.editingId !== null;
  const title = props.title ?? t(editing ? "registryFormTitleEdit" : "registryFormTitleNew");
  const close = () => {
    dialog.close();
    save.reset();
  };

  return (
    <Dialog
      open={dialog.open}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogContent
        aria-describedby={
          props.description === undefined ? undefined : "registry-dialog-description"
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (dialog.form.validate() && problems.length === 0) {
              props.onSubmit();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {props.description !== undefined && (
              <DialogDescription id="registry-dialog-description">
                {props.description}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">{props.children}</div>
          <RegistryFormErrors
            form={dialog.form}
            save={save}
            fieldLabels={props.fieldLabels}
            problems={problems}
            saveErrorMessage={props.saveErrorMessage}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t("registryDialogCancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {editing ? t("registrySubmitEdit") : props.createLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
