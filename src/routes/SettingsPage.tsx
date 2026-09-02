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
import { strings } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";

// Defined at module scope, outside the component, so useTranslation() isn't in scope —
// the range message comes straight from the dictionary (same choice as LoginPage's schema).
// RF32: the backend clamps the radius to 1..1000 m; mirror that here so an out-of-range
// value is caught before the request instead of coming back as a 422.
const settingsSchema = z.object({
  check_radius_meters: z
    .number({ invalid_type_error: strings.settingsRadiusRange })
    .int(strings.settingsRadiusRange)
    .min(1, strings.settingsRadiusRange)
    .max(1000, strings.settingsRadiusRange),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

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
  const radiusField = register("check_radius_meters", { valueAsNumber: true });

  // The query resolves after the first render, so seed the field once its value arrives.
  useEffect(() => {
    if (settings) {
      reset({ check_radius_meters: settings.check_radius_meters });
    }
  }, [settings, reset]);

  const mutation = useMutation({
    mutationFn: async (values: SettingsFormValues) => {
      const { response } = await client.PUT("/settings", {
        body: { check_radius_meters: values.check_radius_meters },
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
        <div className="space-y-1">
          <Label htmlFor="settings-check-radius">{t("settingsRadiusLabel")}</Label>
          <Input
            id="settings-check-radius"
            type="number"
            {...radiusField}
            onChange={(event) => {
              // A fresh edit invalidates the "saved" banner from the previous submit.
              mutation.reset();
              void radiusField.onChange(event);
            }}
          />
          <p className="text-muted-foreground text-sm">{t("settingsRadiusHint")}</p>
          {formState.errors.check_radius_meters && (
            <p role="alert" className="text-destructive text-sm">
              {formState.errors.check_radius_meters.message}
            </p>
          )}
        </div>
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
