import type { BadgeTone } from "@/components/ui/badge";
import type { StringKey } from "@/i18n/strings";
import type { PointVisitStatus } from "@/lib/buildingInterior";

/** The words and tone of a point's visit status; the building and place panels share them. */
export const STATUS_BADGE: Record<
  PointVisitStatus,
  { label: StringKey; tone: BadgeTone | "outline" }
> = {
  IN_PROGRESS: { label: "pointStatusInProgress", tone: "progress" },
  PENDING: { label: "pointStatusPending", tone: "pending" },
  DONE: { label: "pointStatusDone", tone: "done" },
  NOT_SCHEDULED: { label: "pointStatusNotScheduled", tone: "outline" },
};
