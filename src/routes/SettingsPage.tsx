import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { strings, type StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";

// Defined at module scope, outside the component, so useTranslation() isn't in scope —
// the range message comes straight from the dictionary (same choice as LoginPage's schema).
// RF32: the backend clamps the radius to 1..1000 m; mirror that here so an out-of-range
// value is caught before the request instead of coming back as a 422.
// Ruling 8: `system_settings` also holds the alert-scan defaults — the two `_seconds`
// fields clamp to 1..3600, the four `_min` tolerances to 0..1440, matching the backend.
function secondsField() {
  return z
    .number({ invalid_type_error: strings.settingsSecondsRange })
    .int(strings.settingsSecondsRange)
    .min(1, strings.settingsSecondsRange)
    .max(3600, strings.settingsSecondsRange);
}

function minutesField() {
  return z
    .number({ invalid_type_error: strings.settingsMinutesRange })
    .int(strings.settingsMinutesRange)
    .min(0, strings.settingsMinutesRange)
    .max(1440, strings.settingsMinutesRange);
}

const settingsSchema = z.object({
  check_radius_meters: z
    .number({ invalid_type_error: strings.settingsRadiusRange })
    .int(strings.settingsRadiusRange)
    .min(1, strings.settingsRadiusRange)
    .max(1000, strings.settingsRadiusRange),
  alert_scan_interval_seconds: secondsField(),
  position_report_interval_seconds: secondsField(),
  late_start_tolerance_min: minutesField(),
  absence_tolerance_min: minutesField(),
  late_stop_tolerance_min: minutesField(),
  no_evidence_grace_min: minutesField(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

interface NumericFieldDescriptor {
  name: keyof SettingsFormValues;
  labelKey: StringKey;
  hintKey?: StringKey;
}

const NUMERIC_FIELDS: NumericFieldDescriptor[] = [
  {
    name: "check_radius_meters",
    labelKey: "settingsRadiusLabel",
    hintKey: "settingsRadiusHint",
  },
  { name: "alert_scan_interval_seconds", labelKey: "settingsScanIntervalLabel" },
  { name: "position_report_interval_seconds", labelKey: "settingsPositionIntervalLabel" },
  { name: "late_start_tolerance_min", labelKey: "settingsLateStartToleranceLabel" },
  { name: "absence_tolerance_min", labelKey: "settingsAbsenceToleranceLabel" },
  { name: "late_stop_tolerance_min", labelKey: "settingsLateStopToleranceLabel" },
  { name: "no_evidence_grace_min", labelKey: "settingsNoEvidenceGraceLabel" },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors the other pages: fall back to an empty token rather than asserting a non-null
  // session, so the page renders (and its request fails cleanly) before hydration.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const {
    data: settings,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, response } = await client.GET("/settings");
      if (!response.ok) {
        throw new Error("failed-to-load-settings");
      }

      return data;
    },
  });

  const form = useForm<SettingsFormValues>({ resolver: zodResolver(settingsSchema) });
  const { register, handleSubmit, reset, formState } = form;

  // The query resolves after the first render, so seed the fields once their values arrive.
  useEffect(() => {
    if (settings) {
      reset({
        check_radius_meters: settings.check_radius_meters,
        alert_scan_interval_seconds: settings.alert_scan_interval_seconds,
        position_report_interval_seconds: settings.position_report_interval_seconds,
        late_start_tolerance_min: settings.late_start_tolerance_min,
        absence_tolerance_min: settings.absence_tolerance_min,
        late_stop_tolerance_min: settings.late_stop_tolerance_min,
        no_evidence_grace_min: settings.no_evidence_grace_min,
      });
    }
  }, [settings, reset]);

  const mutation = useMutation({
    mutationFn: async (values: SettingsFormValues) => {
      const { response } = await client.PUT("/settings", {
        body: {
          check_radius_meters: values.check_radius_meters,
          alert_scan_interval_seconds: values.alert_scan_interval_seconds,
          position_report_interval_seconds: values.position_report_interval_seconds,
          late_start_tolerance_min: values.late_start_tolerance_min,
          absence_tolerance_min: values.absence_tolerance_min,
          late_stop_tolerance_min: values.late_stop_tolerance_min,
          no_evidence_grace_min: values.no_evidence_grace_min,
        },
      });
      if (!response.ok) {
        throw new Error("failed-to-save-settings");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  if (isLoading) {
    return <p className="text-muted-foreground p-6">{t("settingsLoading")}</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-destructive p-6">
        {t("settingsError")}
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("settingsTitle")}</h1>
      <form
        className="space-y-3"
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => {
            mutation.mutate(values);
          })(event);
        }}
      >
        {NUMERIC_FIELDS.map(({ name, labelKey, hintKey }) => {
          const field = register(name, { valueAsNumber: true });
          const fieldError = formState.errors[name];

          return (
            <div key={name} className="space-y-1">
              <Label htmlFor={`settings-${name}`}>{t(labelKey)}</Label>
              <Input
                id={`settings-${name}`}
                type="number"
                {...field}
                onChange={(changeEvent) => {
                  // A fresh edit invalidates the "saved" banner from the previous submit.
                  mutation.reset();
                  void field.onChange(changeEvent);
                }}
              />
              {hintKey && <p className="text-muted-foreground text-sm">{t(hintKey)}</p>}
              {fieldError && (
                <p role="alert" className="text-destructive text-sm">
                  {fieldError.message}
                </p>
              )}
            </div>
          );
        })}
        {mutation.isSuccess && (
          <p role="status" className="text-sm text-green-700">
            {t("settingsSaved")}
          </p>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          {t("settingsSave")}
        </Button>
      </form>
    </main>
  );
}
