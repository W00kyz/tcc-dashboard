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
import { Page, PageHeader } from "@/components/layout/Page";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Plus } from "lucide-react";
import { ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Badge } from "@/components/ui/badge";

interface ServiceType {
  id: string;
  name: string;
  average_duration_minutes: number;
}

type FormOverview = components["schemas"]["FormOverviewResponse"];
type FormQuestion = components["schemas"]["FormQuestionResponse"];
type QuestionBody = components["schemas"]["QuestionBody"];

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

  // The draft's own `version_number` is a transient placeholder (backend always returns 0 for
  // a DRAFT — it's only set inside the publish transaction), so the next real version has to
  // be computed from how many versions are already published, not read off the draft.
  const nextVersionNumber = (formQuery.data?.published.length ?? 0) + 1;

  return (
    <Page width="wide">
      <PageHeader title={t("formBuilderTitle")} />

      <div className="w-full space-y-1.5 sm:max-w-sm">
        <Label htmlFor="form-service-type">{t("formBuilderPickServiceType")}</Label>
        <NativeSelect
          id="form-service-type"
          value={serviceTypeId}
          onChange={(event) => {
            setServiceTypeId(event.target.value);
          }}
        >
          <NativeSelectOption value="">
            {t("formBuilderPickServiceTypePlaceholder")}
          </NativeSelectOption>
          {serviceTypes?.map((serviceType) => (
            <NativeSelectOption key={serviceType.id} value={serviceType.id}>
              {serviceType.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {serviceTypesError && <ErrorMessage>{t("formBuilderServiceTypesError")}</ErrorMessage>}
      </div>

      {formQuery.isLoading && <LoadingMessage>{t("formBuilderLoading")}</LoadingMessage>}
      {formQuery.isError && <ErrorMessage>{t("formBuilderError")}</ErrorMessage>}

      {formQuery.data && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section aria-labelledby="form-draft-heading" className="bg-card rounded-md border">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <h2 id="form-draft-heading" className="text-primary text-base font-bold">
                {t("formBuilderDraftHeading")}
              </h2>
              <Button size="sm" variant="outline" onClick={openAddDialog}>
                <Plus aria-hidden="true" />
                {t("formBuilderAddQuestion")}
              </Button>
            </div>
            <div className="p-4">
              <SortableQuestionList
                questions={draftQuestions}
                onReorder={(stableKeys) => {
                  reorderQuestions.mutate(stableKeys);
                }}
                onEdit={openEditDialog}
                onRemove={handleRemove}
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3 border-t px-4 py-3">
              {publish.isError && <ErrorMessage>{t("formBuilderPublishError")}</ErrorMessage>}
              <Button
                disabled={draftQuestions.length === 0}
                onClick={() => {
                  setPublishOpen(true);
                }}
              >
                {t("formBuilderPublish")}
              </Button>
            </div>
          </section>

          <section aria-labelledby="form-published-heading" className="bg-card rounded-md border">
            <h2
              id="form-published-heading"
              className="text-primary border-b px-4 py-3 text-base font-bold"
            >
              {t("formBuilderPublishedVersions")}
            </h2>
            {formQuery.data.published.length === 0 ? (
              <p className="text-muted-foreground px-4 py-6 text-sm">
                {t("formBuilderNoPublishedVersions")}
              </p>
            ) : (
              <ul className="divide-y">
                {formQuery.data.published.map((version) => (
                  <li
                    key={version.form_version_id}
                    className="flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <Badge variant="plate">{`v${String(version.version_number)}`}</Badge>
                    <span className="text-muted-foreground">
                      {`${version.published_at ?? "—"} · ${String(version.question_count)} ${t(
                        "formBuilderQuestionCountSuffix",
                      )}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
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
              variant="outline"
              onClick={() => {
                setPublishOpen(false);
              }}
            >
              {t("formBuilderPublishCancel")}
            </Button>
            <Button
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
    </Page>
  );
}
