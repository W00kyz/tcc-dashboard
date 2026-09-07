import type { components } from "@/api/generated/schema";
import { useTranslation } from "@/i18n/useTranslation";

type BoardPosition = components["schemas"]["BoardPosition"];

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

// RF42 ships as a table (spec §7.5 excludes the map from the deliverable): the fix age comes
// straight from the snapshot's `age_seconds`, so no clock seam is needed here.
export function formatAge(seconds: number, t: ReturnType<typeof useTranslation>["t"]): string {
  if (seconds < SECONDS_PER_MINUTE) {
    return t("workerPositionsAgeNow");
  }
  if (seconds < SECONDS_PER_HOUR) {
    const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);

    return t("workerPositionsAgeMinutes").replace("{n}", String(minutes));
  }
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);

  return t("workerPositionsAgeHours").replace("{n}", String(hours));
}

function formatLocation(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

interface WorkerPositionsListProps {
  positions: BoardPosition[];
}

export function WorkerPositionsList({ positions }: WorkerPositionsListProps) {
  const { t } = useTranslation();

  return (
    <section className="space-y-2" aria-labelledby="worker-positions-heading">
      <h2 id="worker-positions-heading" className="text-lg font-semibold">
        {t("workerPositionsTitle")}
      </h2>
      {positions.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("workerPositionsEmpty")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="py-2 pr-4 font-medium">{t("workerPositionsColumnWorker")}</th>
              <th className="py-2 pr-4 font-medium">{t("workerPositionsColumnLocation")}</th>
              <th className="py-2 font-medium">{t("workerPositionsColumnUpdated")}</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => (
              <tr key={position.field_worker_id} className="border-b">
                <td className="py-2 pr-4">{position.field_worker_name}</td>
                <td className="py-2 pr-4 font-mono">
                  {formatLocation(position.latitude, position.longitude)}
                </td>
                <td className="py-2">{formatAge(position.age_seconds, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
