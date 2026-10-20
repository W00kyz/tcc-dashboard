import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Page, PageHeader } from "@/components/layout/Page";
import {
  ErrorMessage,
  FieldError,
  LoadingMessage,
  SuccessMessage,
} from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import {
  formValuesFrom,
  NUMERIC_SECTIONS,
  type NumericFieldDescriptor,
  settingsBodyFrom,
  type SettingsFormValues,
  settingsSchema,
  WEEKDAY_LABEL_KEYS,
} from "@/lib/settingsForm";

type SettingsForm = UseFormReturn<SettingsFormValues>;

const LEGEND_CLASS = "text-primary mb-3 text-base font-bold";

interface FieldProps {
  form: SettingsForm;
  // A fresh edit invalidates the "saved" banner from the previous submit.
  onEdit: () => void;
}

function NumericField({ form, onEdit, field }: FieldProps & { field: NumericFieldDescriptor }) {
  const { t } = useTranslation();
  const registered = form.register(field.name, { valueAsNumber: true });
  const fieldError = form.formState.errors[field.name];

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`settings-${field.name}`}>{t(field.labelKey)}</Label>
      <Input
        id={`settings-${field.name}`}
        type="number"
        step={field.step}
        {...registered}
        onChange={(changeEvent) => {
          onEdit();
          void registered.onChange(changeEvent);
        }}
      />
      {field.hintKey && <p className="text-muted-foreground text-sm">{t(field.hintKey)}</p>}
      {fieldError && <FieldError>{fieldError.message}</FieldError>}
    </div>
  );
}

function NumericSection({
  form,
  onEdit,
  titleKey,
  fields,
}: FieldProps & { titleKey: StringKey; fields: NumericFieldDescriptor[] }) {
  const { t } = useTranslation();

  return (
    <fieldset className="space-y-4">
      <legend className={LEGEND_CLASS}>{t(titleKey)}</legend>
      {titleKey === "settingsSectionCampus" && (
        <p className="text-muted-foreground -mt-2 text-sm">{t("settingsCampusHint")}</p>
      )}
      {fields.map((field) => (
        <NumericField key={field.name} form={form} onEdit={onEdit} field={field} />
      ))}
    </fieldset>
  );
}

// Seven checkboxes for one `number[]` value (Monday=0), so it goes through a Controller.
function ServiceWeekdays({ form, onEdit }: FieldProps) {
  const { t } = useTranslation();
  const fieldError = form.formState.errors.service_weekdays;

  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">{t("settingsServiceWeekdaysLabel")}</legend>
      <Controller
        control={form.control}
        name="service_weekdays"
        render={({ field }) => (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {WEEKDAY_LABEL_KEYS.map((labelKey, weekday) => (
              <label key={labelKey} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={field.value.includes(weekday)}
                  onChange={(event) => {
                    onEdit();
                    field.onChange(
                      event.target.checked
                        ? [...field.value, weekday]
                        : field.value.filter((day) => day !== weekday),
                    );
                  }}
                />
                {t(labelKey)}
              </label>
            ))}
          </div>
        )}
      />
      {fieldError && <FieldError>{fieldError.message}</FieldError>}
    </fieldset>
  );
}

function WorkdaySection({ form, onEdit }: FieldProps) {
  const { t } = useTranslation();
  const registered = form.register("workday_end_time");
  const fieldError = form.formState.errors.workday_end_time;

  return (
    <fieldset className="space-y-4">
      <legend className={LEGEND_CLASS}>{t("settingsSectionWorkday")}</legend>
      <div className="space-y-1.5">
        <Label htmlFor="settings-workday_end_time">{t("settingsWorkdayEndLabel")}</Label>
        <Input
          id="settings-workday_end_time"
          type="time"
          className="w-40"
          {...registered}
          onChange={(changeEvent) => {
            onEdit();
            void registered.onChange(changeEvent);
          }}
        />
        <p className="text-muted-foreground text-sm">{t("settingsWorkdayEndHint")}</p>
        {fieldError && <FieldError>{fieldError.message}</FieldError>}
      </div>
      <ServiceWeekdays form={form} onEdit={onEdit} />
    </fieldset>
  );
}

function AppealSection({ form, onEdit }: FieldProps) {
  const { t } = useTranslation();

  return (
    <fieldset className="space-y-4">
      <legend className={LEGEND_CLASS}>{t("settingsSectionAppeal")}</legend>
      <NumericField
        form={form}
        onEdit={onEdit}
        field={{
          name: "appeal_window_hours",
          labelKey: "settingsAppealWindowLabel",
          hintKey: "settingsAppealWindowHint",
        }}
      />
    </fieldset>
  );
}

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

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { service_weekdays: [] },
  });
  const { handleSubmit, reset } = form;

  // The query resolves after the first render, so seed the fields once their values arrive.
  useEffect(() => {
    if (settings) {
      reset(formValuesFrom(settings));
    }
  }, [settings, reset]);

  const mutation = useMutation({
    mutationFn: async (values: SettingsFormValues) => {
      const { response } = await client.PUT("/settings", { body: settingsBodyFrom(values) });
      if (!response.ok) {
        throw new Error(`PUT /settings failed with status ${String(response.status)}.`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const onEdit = () => {
    mutation.reset();
  };

  if (isLoading) {
    return (
      <Page>
        <LoadingMessage>{t("settingsLoading")}</LoadingMessage>
      </Page>
    );
  }
  if (error) {
    return (
      <Page>
        <ErrorMessage>{t("settingsError")}</ErrorMessage>
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader title={t("settingsTitle")} />
      <form
        className="bg-card space-y-8 rounded-md border p-5 sm:p-6"
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => {
            mutation.mutate(values);
          })(event);
        }}
      >
        {NUMERIC_SECTIONS.map((section) => (
          <NumericSection key={section.titleKey} form={form} onEdit={onEdit} {...section} />
        ))}
        <WorkdaySection form={form} onEdit={onEdit} />
        <AppealSection form={form} onEdit={onEdit} />
        {mutation.isSuccess && <SuccessMessage>{t("settingsSaved")}</SuccessMessage>}
        <Button type="submit" disabled={mutation.isPending}>
          {t("settingsSave")}
        </Button>
      </form>
    </Page>
  );
}
