import { useMutation, useQuery } from "@tanstack/react-query";

import { ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";

/** What a removal takes with it (backend `DeletionImpactOut`). */
export interface DeletionImpact {
  points: number;
  floors: number;
  routes: number;
  executions: number;
  photos: number;
  appeals: number;
}

// Order of the list; each kind with its singular and plural wording.
const IMPACT_LINES: { kind: keyof DeletionImpact; one: StringKey; many: StringKey }[] = [
  { kind: "floors", one: "deletionImpactFloorsOne", many: "deletionImpactFloors" },
  { kind: "points", one: "deletionImpactPointsOne", many: "deletionImpactPoints" },
  { kind: "routes", one: "deletionImpactRoutesOne", many: "deletionImpactRoutes" },
  { kind: "executions", one: "deletionImpactExecutionsOne", many: "deletionImpactExecutions" },
  { kind: "photos", one: "deletionImpactPhotosOne", many: "deletionImpactPhotos" },
  { kind: "appeals", one: "deletionImpactAppealsOne", many: "deletionImpactAppeals" },
];

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Identifies the record, so a second removal does not show the first one's impact. */
  impactKey: string;
  loadImpact: () => Promise<DeletionImpact>;
  onConfirm: () => Promise<void>;
  onDeleted: () => void;
}

function ImpactList({ impact }: { impact: DeletionImpact }) {
  const { t } = useTranslation();
  const lines = IMPACT_LINES.filter(({ kind }) => impact[kind] > 0);
  if (lines.length === 0) {
    return <p className="text-sm">{t("deletionImpactNothingElse")}</p>;
  }

  return (
    <div className="space-y-1 text-sm">
      <p>{t("deletionImpactHeading")}</p>
      <ul className="list-disc pl-5">
        {lines.map(({ kind, one, many }) => (
          <li key={kind}>
            {impact[kind] === 1 ? t(one) : t(many).replace("{n}", String(impact[kind]))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Asks before removing a building or a service point, listing the history that goes with it
 * (decided by the product owner: removal deletes the history).
 * @example <DeleteConfirmDialog open title="Remover Bloco CI?" impactKey={id} ... /> */
export function DeleteConfirmDialog(props: DeleteConfirmDialogProps) {
  const { t } = useTranslation();
  const impact = useQuery({
    queryKey: ["deletion-impact", props.impactKey],
    queryFn: props.loadImpact,
    enabled: props.open,
    // Always fresh: the history may have grown since the dialog was last opened.
    staleTime: 0,
    gcTime: 0,
  });
  const removal = useMutation({ mutationFn: props.onConfirm, onSuccess: props.onDeleted });

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        removal.reset();
        props.onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{t("deletionIrreversible")}</DialogDescription>
        </DialogHeader>
        {impact.isPending && <LoadingMessage>{t("deletionImpactLoading")}</LoadingMessage>}
        {impact.isError && <ErrorMessage>{t("deletionImpactError")}</ErrorMessage>}
        {impact.data !== undefined && <ImpactList impact={impact.data} />}
        {removal.isError && <ErrorMessage>{t("deletionError")}</ErrorMessage>}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              props.onOpenChange(false);
            }}
          >
            {t("registryDialogCancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={impact.data === undefined || removal.isPending}
            onClick={() => {
              removal.mutate();
            }}
          >
            {t("deletionConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
