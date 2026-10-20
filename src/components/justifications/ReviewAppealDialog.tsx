import { useState } from "react";

import type { components } from "@/api/generated/schema";
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

type Appeal = components["schemas"]["AppealOut"];
export type AppealDecision = "accept" | "reject";

// Mirrors AppealReviewBody.note in the backend (APPEAL_NOTE_MAX_LENGTH).
const NOTE_MAX_LENGTH = 1000;

export interface ReviewTarget {
  appeal: Appeal;
  decision: AppealDecision;
}

interface ReviewAppealDialogProps {
  /** The appeal being decided; null keeps the dialog closed. */
  target: ReviewTarget | null;
  pending: boolean;
  onCancel: () => void;
  /** The trimmed note, or null when left blank. */
  onConfirm: (note: string | null) => void;
}

function ReviewForm({
  target,
  pending,
  onCancel,
  onConfirm,
}: ReviewAppealDialogProps & { target: ReviewTarget }) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const accepting = target.decision === "accept";

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm(note.trim() === "" ? null : note.trim());
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {t(accepting ? "justificationsAcceptTitle" : "justificationsRejectTitle")}
        </DialogTitle>
        <DialogDescription>
          {t("justificationsReviewDescription")
            .replace("{name}", target.appeal.field_worker_name)
            .replace("{point}", target.appeal.service_point_name)}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <Label htmlFor="appeal-review-note">{t("justificationsReviewNoteLabel")}</Label>
        <Textarea
          id="appeal-review-note"
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("registryDialogCancel")}
        </Button>
        <Button type="submit" variant={accepting ? "default" : "destructive"} disabled={pending}>
          {t(accepting ? "justificationsAccept" : "justificationsReject")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Accept or reject an appeal, with an optional note for the worker's record. */
export function ReviewAppealDialog(props: ReviewAppealDialogProps) {
  const { target, onCancel } = props;

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
        {/* Mounted only while open, so each decision starts with a blank note. */}
        {target !== null && <ReviewForm {...props} target={target} />}
      </DialogContent>
    </Dialog>
  );
}
