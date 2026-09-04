import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { QuestionEditorDialog } from "@/components/QuestionEditorDialog";
import { SortableQuestionList } from "@/components/SortableQuestionList";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

interface ServiceType {
  id: string;
  name: string;
  average_duration_minutes: number;
}

type FormOverview = components["schemas"]["FormOverviewResponse"];
type FormQuestion = components["schemas"]["FormQuestionResponse"];
type QuestionBody = components["schemas"]["QuestionBody"];

const SELECT_CLASS = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm";

function toQuestionBody(question: FormQuestion): QuestionBody {
  return {
    prompt: question.prompt,
    question_type: question.question_type,
    required: question.required,
    options: question.options,
  };
}

export function FormBuilderPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const [serviceTypeId, setServiceTypeId] = useState("");
  const [editing, setEditing] = useState<FormQuestion | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const { data: serviceTypes, isError: serviceTypesError } = useQuery({
    queryKey: ["service-types"],
    queryFn: async () => {
      const { data } = await client.GET("/service-types");

      return data as ServiceType[];
    },
  });

  const formQuery = useQuery({
    queryKey: ["form", serviceTypeId],
    enabled: serviceTypeId !== "",
    queryFn: async (): Promise<FormOverview> => {
      const { data, response } = await client.GET("/service-types/{service_type_id}/form", {
        params: { path: { service_type_id: serviceTypeId } },
      });
      if (!response.ok || data === undefined) {
        throw new Error(
          `GET /service-types/${serviceTypeId}/form failed with status ${String(response.status)}.`,
        );
      }

      return data;
    },
  });

  const formId = formQuery.data?.form_id ?? "";
  const draftQuestions = formQuery.data?.draft.questions ?? [];

  function invalidateForm() {
    void queryClient.invalidateQueries({ queryKey: ["form", serviceTypeId] });
  }

  const addQuestion = useMutation({
    mutationFn: async (body: QuestionBody) => {
      const { response } = await client.POST("/forms/{form_id}/draft/questions", {
        params: { path: { form_id: formId } },
        body,
      });
      if (!response.ok) {
        throw new Error(
          `POST /forms/${formId}/draft/questions failed (${String(response.status)}).`,
        );
      }
    },
    onSuccess: () => {
      invalidateForm();
      setDialogOpen(false);
    },
  });

  const updateQuestion = useMutation({
    mutationFn: async ({ stableKey, body }: { stableKey: string; body: QuestionBody }) => {
      const { response } = await client.PATCH("/forms/{form_id}/draft/questions/{stable_key}", {
        params: { path: { form_id: formId, stable_key: stableKey } },
        body,
      });
      if (!response.ok) {
        throw new Error(`PATCH question ${stableKey} failed (${String(response.status)}).`);
      }
    },
    onSuccess: () => {
      invalidateForm();
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const removeQuestion = useMutation({
    mutationFn: async (stableKey: string) => {
      const { response } = await client.DELETE("/forms/{form_id}/draft/questions/{stable_key}", {
        params: { path: { form_id: formId, stable_key: stableKey } },
      });
      if (!response.ok) {
        throw new Error(`DELETE question ${stableKey} failed (${String(response.status)}).`);
      }
    },
    onSuccess: invalidateForm,
  });

  const reorderQuestions = useMutation({
    mutationFn: async (stableKeys: string[]) => {
      const { response } = await client.PUT("/forms/{form_id}/draft/order", {
        params: { path: { form_id: formId } },
        body: { stable_keys: stableKeys },
      });
      if (!response.ok) {
        throw new Error(`PUT /forms/${formId}/draft/order failed (${String(response.status)}).`);
      }
    },
    onSuccess: invalidateForm,
  });

  const publish = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/forms/{form_id}/publish", {
        params: { path: { form_id: formId } },
      });
      if (!response.ok) {
        throw new Error(`POST /forms/${formId}/publish failed (${String(response.status)}).`);
      }
    },
    onSuccess: () => {
      invalidateForm();
      setPublishOpen(false);
    },
  });

  function openAddDialog() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEditDialog(question: FormQuestion) {
    setEditing(question);
    setDialogOpen(true);
  }

  function handleDialogSubmit(body: QuestionBody) {
    if (editing === null) {
      addQuestion.mutate(body);

      return;
    }
    updateQuestion.mutate({ stableKey: editing.stable_key, body });
  }

  function handleRemove(stableKey: string) {
    if (window.confirm(t("formBuilderRemoveConfirm"))) {
      removeQuestion.mutate(stableKey);
    }
  }

  const nextVersionNumber = formQuery.data?.draft.version_number ?? 1;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("formBuilderTitle")}</h1>

      <div className="space-y-1">
        <Label htmlFor="form-service-type">{t("formBuilderPickServiceType")}</Label>
        <select
          id="form-service-type"
          className={SELECT_CLASS}
          value={serviceTypeId}
          onChange={(event) => {
            setServiceTypeId(event.target.value);
          }}
        >
          <option value="">{t("formBuilderPickServiceTypePlaceholder")}</option>
          {serviceTypes?.map((serviceType) => (
            <option key={serviceType.id} value={serviceType.id}>
              {serviceType.name}
            </option>
          ))}
        </select>
        {serviceTypesError && (
          <p role="alert" className="text-destructive text-sm">
            {t("formBuilderServiceTypesError")}
          </p>
        )}
      </div>

      {formQuery.isLoading && <p className="text-muted-foreground">{t("formBuilderLoading")}</p>}
      {formQuery.isError && (
        <p role="alert" className="text-destructive">
          {t("formBuilderError")}
        </p>
      )}

      {formQuery.data && (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("formBuilderDraftHeading")}</h2>
              <Button size="sm" onClick={openAddDialog}>
                {t("formBuilderAddQuestion")}
              </Button>
            </div>
            <SortableQuestionList
              questions={draftQuestions}
              onReorder={(stableKeys) => {
                reorderQuestions.mutate(stableKeys);
              }}
              onEdit={openEditDialog}
              onRemove={handleRemove}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={draftQuestions.length === 0}
              onClick={() => {
                setPublishOpen(true);
              }}
            >
              {t("formBuilderPublish")}
            </Button>
            {publish.isError && (
              <p role="alert" className="text-destructive text-sm">
                {t("formBuilderPublishError")}
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">{t("formBuilderPublishedVersions")}</h2>
            {formQuery.data.published.length === 0 ? (
              <p className="text-muted-foreground">{t("formBuilderNoPublishedVersions")}</p>
            ) : (
              <ul className="divide-border divide-y">
                {formQuery.data.published.map((version) => (
                  <li key={version.form_version_id} className="py-2 text-sm">
                    {`v${String(version.version_number)} · ${version.published_at ?? "—"} · ${String(
                      version.question_count,
                    )} ${t("formBuilderQuestionCountSuffix")}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <QuestionEditorDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
          }
        }}
        initialValue={editing === null ? null : toQuestionBody(editing)}
        onSubmit={handleDialogSubmit}
        isPending={addQuestion.isPending || updateQuestion.isPending}
        isError={addQuestion.isError || updateQuestion.isError}
      />

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>{t("formBuilderPublishDialogTitle")}</DialogTitle>
          <p className="text-muted-foreground text-sm">
            {t("formBuilderPublishConfirm").replace("{n}", String(nextVersionNumber))}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPublishOpen(false);
              }}
            >
              {t("formBuilderPublishCancel")}
            </Button>
            <Button
              size="sm"
              disabled={publish.isPending}
              onClick={() => {
                publish.mutate();
              }}
            >
              {t("formBuilderPublishConfirmButton")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
