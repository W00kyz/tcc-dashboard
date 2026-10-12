import type { StringKey } from "@/i18n/strings";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

type Translate = (key: StringKey) => string;

/**
 * RF42: how old a worker's last fix is, in words. The age comes straight from the snapshot's
 * `age_seconds`, so no clock seam is needed here.
 *
 * @example formatAge(300, t) // "há 5 min"
 */
export function formatAge(seconds: number, t: Translate): string {
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
