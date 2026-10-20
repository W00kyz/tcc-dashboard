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

/**
 * A `YYYY-MM-DD` API date as the pt-BR `DD/MM/YYYY` a manager reads. Pure string work, so
 * no timezone can shift the day. Anything not in that shape comes back unchanged.
 *
 * @example formatIsoDateBr("2026-08-31") // "31/08/2026"
 */
export function formatIsoDateBr(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match === null) {
    return isoDate;
  }

  return `${match[3] ?? ""}/${match[2] ?? ""}/${match[1] ?? ""}`;
}

/**
 * A `YYYY-MM-DD` API date as a pt-BR long date for headings. Built at local noon so no
 * timezone can roll it to a neighbouring day. Returns "" for anything else.
 *
 * @example formatIsoDateLongBr("2026-10-11") // "domingo, 11 de outubro de 2026"
 */
export function formatIsoDateLongBr(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return "";
  }

  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * A compliance-report period as the manager reads it, from its first day (`period_start`) and
 * the report granularity. The API's own `period_label` ("2026-W41", "2026-10") is a sortable
 * code meant for the PDF/XLSX exports, not for the screen.
 *
 * @example formatReportPeriodBr("WEEKLY", "2026-10-05") // "Semana de 05/10/2026"
 */
export function formatReportPeriodBr(granularity: string, periodStart: string): string {
  if (granularity === "WEEKLY") {
    return `Semana de ${formatIsoDateBr(periodStart)}`;
  }
  if (granularity === "MONTHLY" && /^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
    const month = new Date(`${periodStart}T12:00:00`).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    return month.charAt(0).toUpperCase() + month.slice(1);
  }

  return formatIsoDateBr(periodStart);
}
