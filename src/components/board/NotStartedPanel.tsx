import type { BoardSnapshot } from "@/api/monitoringStream";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n/useTranslation";

type WorkerRef = BoardSnapshot["not_started"][number];

/** "Ainda não iniciaram hoje": approved, active workers with no route today. Informative only —
 * nobody is assigned anything, they pull their batch when they start (spec 2026-10-20 §8.2). */
export function NotStartedPanel({ workers }: { workers: WorkerRef[] }) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="board-not-started-heading" className="bg-card rounded-md border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 id="board-not-started-heading" className="text-primary text-base font-bold">
          {t("boardNotStartedTitle")}
        </h2>
        <Badge variant="pending" aria-hidden="true">
          {workers.length}
        </Badge>
      </div>
      <ul className="grid gap-x-6 px-4 py-2 sm:grid-cols-2 xl:grid-cols-3">
        {workers.map((worker) => (
          <li key={worker.id} className="flex items-baseline gap-2 py-1.5 text-sm">
            <span className="text-foreground font-semibold">{worker.full_name}</span>
            <span className="text-muted-foreground truncate">{worker.company_name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
