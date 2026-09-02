import { useTranslation } from "@/i18n/useTranslation";

interface ExecutionDetailDrawerProps {
  executionId: string;
  onClose: () => void;
}

// STUB (Etapa 5, Task 12): the real timeline / evidence viewer / resolve-review body is
// built in Task 13. Kept as a separate component so the history page can wire the row
// click and the close handler now, and Task 13 only replaces this body.
export function ExecutionDetailDrawer({ executionId, onClose }: ExecutionDetailDrawerProps) {
  const { t } = useTranslation();

  return (
    <aside
      role="dialog"
      aria-label={t("executionDetailDrawerTitle")}
      className="bg-background fixed inset-y-0 right-0 z-50 w-full max-w-md border-l p-6 shadow-lg"
    >
      <button type="button" className="text-sm underline" onClick={onClose}>
        {t("executionDetailDrawerClose")}
      </button>
      <p className="mt-4 text-sm">
        {t("executionDetailDrawerPlaceholder")} {executionId}
      </p>
    </aside>
  );
}
