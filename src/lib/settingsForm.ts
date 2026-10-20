import { z } from "zod";

import type { components } from "@/api/generated/schema";
import { strings, type StringKey } from "@/i18n/strings";

type Settings = components["schemas"]["SettingsOut"];
export type SettingsUpdate = components["schemas"]["SettingsUpdate"];

// Defined at module scope, outside a component, so the messages come straight from the
// dictionary (same choice as LoginPage's schema). Every range mirrors the backend's
// `SettingsUpdate` bounds, so an out-of-range value is caught before the request instead of
// coming back as a 422.
function intField(min: number, max: number, message: string) {
  return z.number({ invalid_type_error: message }).int(message).min(min, message).max(max, message);
}

function coordinateField(limit: number, message: string) {
  return z.number({ invalid_type_error: message }).min(-limit, message).max(limit, message);
}

const releaseMinutes = () => intField(1, 1440, strings.settingsReleaseMinutesRange);

export const settingsSchema = z
  .object({
    check_radius_meters: intField(1, 1000, strings.settingsRadiusRange),
    alert_scan_interval_seconds: intField(1, 3600, strings.settingsSecondsRange),
    position_report_interval_seconds: intField(1, 3600, strings.settingsSecondsRange),
    no_evidence_grace_min: intField(0, 1440, strings.settingsMinutesRange),
    allocation_batch_size: intField(1, 50, strings.settingsBatchSizeRange),
    campus_min_lat: coordinateField(90, strings.settingsLatitudeRange),
    campus_max_lat: coordinateField(90, strings.settingsLatitudeRange),
    campus_min_lng: coordinateField(180, strings.settingsLongitudeRange),
    campus_max_lng: coordinateField(180, strings.settingsLongitudeRange),
    outside_campus_release_minutes: releaseMinutes(),
    location_silence_warning_minutes: releaseMinutes(),
    location_silence_release_minutes: releaseMinutes(),
    workday_end_time: z.string().min(1, strings.settingsWorkdayEndRequired),
    service_weekdays: z.array(z.number()).min(1, strings.settingsServiceWeekdaysRequired),
    appeal_window_hours: intField(1, 720, strings.settingsAppealWindowRange),
  })
  .refine((values) => values.campus_min_lat < values.campus_max_lat, {
    message: strings.settingsLatitudeOrder,
    path: ["campus_min_lat"],
  })
  .refine((values) => values.campus_min_lng < values.campus_max_lng, {
    message: strings.settingsLongitudeOrder,
    path: ["campus_min_lng"],
  })
  // The app warns the worker before their points are released, never after.
  .refine(
    (values) => values.location_silence_release_minutes > values.location_silence_warning_minutes,
    { message: strings.settingsSilenceOrder, path: ["location_silence_release_minutes"] },
  );

export type SettingsFormValues = z.infer<typeof settingsSchema>;
export type NumericSettingName = Exclude<
  keyof SettingsFormValues,
  "workday_end_time" | "service_weekdays"
>;

export interface NumericFieldDescriptor {
  name: NumericSettingName;
  labelKey: StringKey;
  hintKey?: StringKey;
  // Coordinates take decimals; everything else is a whole number.
  step?: string;
}

/** The form's numeric fields, grouped in the sections the page draws. */
export const NUMERIC_SECTIONS: { titleKey: StringKey; fields: NumericFieldDescriptor[] }[] = [
  {
    titleKey: "settingsSectionExecution",
    fields: [
      {
        name: "check_radius_meters",
        labelKey: "settingsRadiusLabel",
        hintKey: "settingsRadiusHint",
      },
      { name: "alert_scan_interval_seconds", labelKey: "settingsScanIntervalLabel" },
      { name: "position_report_interval_seconds", labelKey: "settingsPositionIntervalLabel" },
      { name: "no_evidence_grace_min", labelKey: "settingsNoEvidenceGraceLabel" },
    ],
  },
  {
    titleKey: "settingsSectionAllocation",
    fields: [
      {
        name: "allocation_batch_size",
        labelKey: "settingsBatchSizeLabel",
        hintKey: "settingsBatchSizeHint",
      },
    ],
  },
  {
    titleKey: "settingsSectionCampus",
    fields: [
      { name: "campus_min_lat", labelKey: "settingsCampusMinLatLabel", step: "any" },
      { name: "campus_max_lat", labelKey: "settingsCampusMaxLatLabel", step: "any" },
      { name: "campus_min_lng", labelKey: "settingsCampusMinLngLabel", step: "any" },
      { name: "campus_max_lng", labelKey: "settingsCampusMaxLngLabel", step: "any" },
    ],
  },
  {
    titleKey: "settingsSectionRelease",
    fields: [
      { name: "outside_campus_release_minutes", labelKey: "settingsOutsideCampusLabel" },
      { name: "location_silence_warning_minutes", labelKey: "settingsSilenceWarningLabel" },
      { name: "location_silence_release_minutes", labelKey: "settingsSilenceReleaseLabel" },
    ],
  },
];

// Monday=0, as the backend's `date.weekday()` counts.
export const WEEKDAY_LABEL_KEYS: StringKey[] = [
  "settingsWeekdayMon",
  "settingsWeekdayTue",
  "settingsWeekdayWed",
  "settingsWeekdayThu",
  "settingsWeekdayFri",
  "settingsWeekdaySat",
  "settingsWeekdaySun",
];

/** The stored settings as form values: the `time` input only takes "HH:MM".
 * @example formValuesFrom(settings).workday_end_time // "17:00" */
export function formValuesFrom(settings: Settings): SettingsFormValues {
  // `updated_at` is the one field the form does not edit; it must not ride along into the PUT.
  const values: Omit<Settings, "updated_at"> & { updated_at?: string | null } = { ...settings };
  delete values.updated_at;

  return { ...values, workday_end_time: settings.workday_end_time.slice(0, 5) };
}

/** The form values as the PUT body, weekdays in calendar order and the end time with seconds.
 * @example settingsBodyFrom(values).workday_end_time // "17:00:00" */
export function settingsBodyFrom(values: SettingsFormValues): SettingsUpdate {
  const time = values.workday_end_time;

  return {
    ...values,
    workday_end_time: time.length === 5 ? `${time}:00` : time,
    service_weekdays: [...values.service_weekdays].sort((a, b) => a - b),
  };
}
