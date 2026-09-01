/**
 * Local calendar date as `YYYY-MM-DD`. NOT `new Date().toISOString().slice(0, 10)` —
 * that is the UTC day and rolls over early/late for a Brazil-time (UTC-3) user near
 * midnight, so a default "today" filter seeded from it would hide today's routes.
 *
 * @example toLocalIsoDate(new Date("2026-09-02T02:30:00Z")) // "2026-09-01" in UTC-3
 */
export function toLocalIsoDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${String(date.getFullYear())}-${month}-${day}`;
}
