import type { StringKey } from "@/i18n/strings";
import { toLocalIsoDate } from "@/lib/dates";

// ISO weekday ints (Mon=1 .. Sun=7) — the backend's `RouteTemplate.weekdays` convention
// (app/domain/routing/templates.py). JS `Date.getDay()` is Sun=0 .. Sat=6, so Sunday folds
// to 7 in `isoWeekday` below.
export const WEEKDAY_OPTIONS: readonly { iso: number; key: StringKey }[] = [
  { iso: 1, key: "routeTemplateWeekdayMon" },
  { iso: 2, key: "routeTemplateWeekdayTue" },
  { iso: 3, key: "routeTemplateWeekdayWed" },
  { iso: 4, key: "routeTemplateWeekdayThu" },
  { iso: 5, key: "routeTemplateWeekdayFri" },
  { iso: 6, key: "routeTemplateWeekdaySat" },
  { iso: 7, key: "routeTemplateWeekdaySun" },
];

function isoWeekday(date: Date): number {
  const day = date.getDay();

  return day === 0 ? 7 : day;
}

// The date the materialize dialog opens on: for WEEKLY, the first date from today (inclusive)
// whose ISO weekday the template recurs on; for DAILY — or a WEEKLY template with no weekdays
// — today. The manager can still override it in the dialog.
export function nextMaterializeDate(recurrence: string, weekdays: number[] | null): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (recurrence !== "WEEKLY" || weekdays === null || weekdays.length === 0) {
    return toLocalIsoDate(start);
  }
  for (let offset = 0; offset < 7; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    if (weekdays.includes(isoWeekday(candidate))) {
      return toLocalIsoDate(candidate);
    }
  }

  return toLocalIsoDate(start);
}

// Templates carry a bare "HH:MM" time-of-day, never a datetime — unlike the route builder,
// which glues the route date in front and sends a Z-ISO instant. Empty means "no window".
export function timeOrNull(value: string): string | null {
  return value === "" ? null : value;
}

export function recurrenceLabelKey(recurrence: string): StringKey {
  return recurrence === "WEEKLY" ? "routeTemplateRecurrenceWeekly" : "routeTemplateRecurrenceDaily";
}
