import type { components } from "@/api/generated/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { formatReportPeriodBr } from "@/lib/dates";
import { RELEASE_REASON_LABEL_KEY } from "@/lib/releaseReason";

type ComplianceReport = components["schemas"]["ComplianceReportOut"];
type ComplianceTotals = components["schemas"]["ComplianceTotalsOut"];

type MetricField = Exclude<keyof ComplianceTotals, "completion_rate">;

interface MetricGroup {
  key: StringKey;
  columns: { field: MetricField; key: StringKey }[];
}

// Column order mirrors `ComplianceRowOut` / `ComplianceTotalsOut`: the point-day indicators,
// the releases by reason (`points_impeded` is the IMPEDIMENT release counter), the linked
// executions; then `alerts_total` and `completion_rate`, which stand alone.
const METRIC_GROUPS: MetricGroup[] = [
  {
    key: "reportsGroupPoints",
    columns: [
      { field: "points_total", key: "reportsColTotal" },
      { field: "points_done", key: "reportsColPointsDone" },
      { field: "points_done_by_appeal", key: "reportsColPointsDoneByAppeal" },
      { field: "points_unserved", key: "reportsColPointsUnserved" },
    ],
  },
  {
    key: "reportsGroupReleases",
    columns: [
      { field: "points_released", key: "reportsColTotal" },
      { field: "points_impeded", key: RELEASE_REASON_LABEL_KEY.IMPEDIMENT },
      { field: "released_route_remainder", key: RELEASE_REASON_LABEL_KEY.ROUTE_REMAINDER },
      { field: "released_left_campus", key: RELEASE_REASON_LABEL_KEY.LEFT_CAMPUS },
      { field: "released_location_silence", key: RELEASE_REASON_LABEL_KEY.LOCATION_SILENCE },
      { field: "released_end_of_day", key: RELEASE_REASON_LABEL_KEY.END_OF_DAY },
    ],
  },
  {
    key: "reportsGroupExecutions",
    columns: [
      { field: "executions_total", key: "reportsColTotal" },
      { field: "executions_with_evidence", key: "reportsColExecutionsWithEvidence" },
      { field: "executions_flagged", key: "reportsColExecutionsFlagged" },
    ],
  },
];

const METRIC_COLUMNS: MetricField[] = [
  ...METRIC_GROUPS.flatMap((group) => group.columns.map((column) => column.field)),
  "alerts_total",
];

// "87,3%" — one decimal, pt-BR comma. `completion_rate` is a 0..1 ratio from the builder.
function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1).replace(".", ",")}%`;
}

/** One row per period plus a bold TOTAIS row; the indicators grouped under a two-row header. */
export function ComplianceReportTable({ report }: { report: ComplianceReport }) {
  const { t } = useTranslation();

  return (
    <div className="bg-card rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead rowSpan={2}>{t("reportsColPeriod")}</TableHead>
            {METRIC_GROUPS.map((group) => (
              <TableHead
                key={group.key}
                colSpan={group.columns.length}
                className="border-x text-center"
              >
                {t(group.key)}
              </TableHead>
            ))}
            <TableHead rowSpan={2} className="text-right">
              {t("reportsColAlerts")}
            </TableHead>
            <TableHead rowSpan={2} className="text-right">
              {t("reportsColCompletionRate")}
            </TableHead>
          </TableRow>
          <TableRow>
            {METRIC_GROUPS.flatMap((group) =>
              group.columns.map((column) => (
                <TableHead className="text-right" key={column.field}>
                  {t(column.key)}
                </TableHead>
              )),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.periods.map((period) => (
            <TableRow key={period.period_start}>
              <TableCell className="font-semibold whitespace-nowrap">
                {formatReportPeriodBr(report.granularity, period.period_start)}
              </TableCell>
              {METRIC_COLUMNS.map((field) => (
                <TableCell className="text-right" key={field}>
                  {period[field]}
                </TableCell>
              ))}
              <TableCell className="text-right">{formatRate(period.completion_rate)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/60 font-bold hover:bg-muted/60">
            <TableCell>{t("reportsTotalsRow")}</TableCell>
            {METRIC_COLUMNS.map((field) => (
              <TableCell className="text-right" key={field}>
                {report.totals[field]}
              </TableCell>
            ))}
            <TableCell className="text-right">
              {formatRate(report.totals.completion_rate)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
