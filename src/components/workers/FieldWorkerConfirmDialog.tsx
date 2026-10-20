import type { components } from "@/api/generated/schema";
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

interface ConfirmTarget {
  worker: components["schemas"]["FieldWorkerOut"];
  kind: "deactivate" | "reactivate";
}

interface FieldWorkerConfirmDialogProps {
  /** What is being confirmed; null keeps the dialog closed. */
  target: ConfirmTarget | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Asks before deactivating or reactivating an approved worker. */
export function FieldWorkerConfirmDialog({
  target,
  pending,
  onCancel,
  onConfirm,
}: FieldWorkerConfirmDialogProps) {
  const { t } = useTranslation();
  const deactivating = target?.kind === "deactivate";

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <DialogContent>
        {target !== null && (
          <>
            <DialogHeader>
              <DialogTitle>
                {t(
                  deactivating ? "fieldWorkersDeactivateTitle" : "fieldWorkersReactivateTitle",
                ).replace("{name}", target.worker.full_name)}
              </DialogTitle>
              <DialogDescription>
                {t(
                  deactivating
                    ? "fieldWorkersDeactivateDescription"
                    : "fieldWorkersReactivateDescription",
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>
                {t("registryDialogCancel")}
              </Button>
              <Button
                type="button"
                variant={deactivating ? "destructive" : "default"}
                disabled={pending}
                onClick={onConfirm}
              >
                {t(deactivating ? "fieldWorkersDeactivate" : "fieldWorkersReactivate")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
