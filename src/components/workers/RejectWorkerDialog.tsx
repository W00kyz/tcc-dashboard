import { useState } from "react";

import { Field } from "@/components/layout/Registry";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/i18n/useTranslation";

// Mirrors RejectRequest.reason in the backend (max_length=300).
const REASON_MAX_LENGTH = 300;

interface RejectWorkerDialogProps {
  /** The worker being rejected; null keeps the dialog closed. */
  workerName: string | null;
  pending: boolean;
  onCancel: () => void;
  /** The trimmed reason, or null when left blank. */
  onReject: (reason: string | null) => void;
}

function RejectForm({
  workerName,
  pending,
  onCancel,
  onReject,
}: RejectWorkerDialogProps & { workerName: string }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onReject(reason.trim() === "" ? null : reason.trim());
      }}
    >
      <DialogHeader>
        <DialogTitle>{t("fieldWorkersRejectTitle")}</DialogTitle>
        <DialogDescription>
          {t("fieldWorkersRejectDescription").replace("{name}", workerName)}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <Label htmlFor="worker-reject-reason">{t("fieldWorkersRejectReasonLabel")}</Label>
        <Textarea
          id="worker-reject-reason"
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("registryDialogCancel")}
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          {t("fieldWorkersReject")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Reprovar cadastro": asks for an optional reason before rejecting a pending worker. */
export function RejectWorkerDialog(props: RejectWorkerDialogProps) {
  const { workerName, onCancel } = props;

  return (
    <Dialog
      open={workerName !== null}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
    >
      <DialogContent>
        {/* Mounted only while open, so each rejection starts with a blank reason. */}
        {workerName !== null && <RejectForm {...props} workerName={workerName} />}
      </DialogContent>
    </Dialog>
  );
}
