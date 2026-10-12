import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import type { components } from "@/api/generated/schema";
import { QUESTION_TYPE_LABELS } from "@/components/SortableQuestionList";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { strings } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { ErrorMessage, FieldError } from "@/components/layout/StateMessages";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Plus, Trash2 } from "lucide-react";

type QuestionBody = components["schemas"]["QuestionBody"];
type QuestionType = components["schemas"]["QuestionType"];

const QUESTION_TYPES: QuestionType[] = [
  "TEXT",
  "NUMBER",
  "BOOLEAN",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
];

function isChoiceType(questionType: QuestionType): boolean {
  return questionType === "SINGLE_CHOICE" || questionType === "MULTI_CHOICE";
}

// Module scope: useTranslation() isn't in reach here, so refine messages come straight from
// the dictionary (same choice as SettingsPage's schema). The backend rejects a publish when a
// choice type has <2 options or a non-choice type carries any — mirror the first half here so
// the draft never holds a question that can't be published.
const questionSchema = z
  .object({
    prompt: z.string().trim().min(1, strings.formQuestionPromptRequired),
    question_type: z.enum(["TEXT", "NUMBER", "BOOLEAN", "SINGLE_CHOICE", "MULTI_CHOICE"]),
    required: z.boolean(),
    options: z.array(z.object({ value: z.string() })),
  })
  .superRefine((values, ctx) => {
    if (!isChoiceType(values.question_type)) {
      return;
    }
    const filled = values.options.filter((option) => option.value.trim() !== "");
    if (filled.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: strings.formQuestionOptionsRequired,
      });
    }
  });

type QuestionFormValues = z.infer<typeof questionSchema>;

function toFormValues(initial: QuestionBody | null): QuestionFormValues {
  return {
    prompt: initial?.prompt ?? "",
    question_type: initial?.question_type ?? "TEXT",
    required: initial?.required ?? false,
    options: (initial?.options ?? []).map((value) => ({ value })),
  };
}

interface QuestionEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The question being edited, or `null` for a fresh one. */
  initialValue: QuestionBody | null;
  onSubmit: (body: QuestionBody) => void;
  isPending: boolean;
  isError: boolean;
}

export function QuestionEditorDialog({
  open,
  onOpenChange,
  initialValue,
  onSubmit,
  isPending,
  isError,
}: QuestionEditorDialogProps) {
  const { t } = useTranslation();
  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: toFormValues(initialValue),
  });
  const { register, handleSubmit, control, watch, reset, formState } = form;
  const options = useFieldArray({ control, name: "options" });

  // The dialog instance is reused for add and every edit, so re-seed the fields each time it
  // opens rather than on mount only.
  useEffect(() => {
    if (open) {
      reset(toFormValues(initialValue));
    }
  }, [open, initialValue, reset]);

  const questionType = watch("question_type");
  const choiceType = isChoiceType(questionType);

  function submit(values: QuestionFormValues) {
    const trimmed = values.options.map((option) => option.value.trim()).filter(Boolean);
    onSubmit({
      prompt: values.prompt.trim(),
      question_type: values.question_type,
      required: values.required,
      options: choiceType ? trimmed : [],
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>
          {initialValue === null
            ? t("formQuestionDialogAddTitle")
            : t("formQuestionDialogEditTitle")}
        </DialogTitle>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            void handleSubmit(submit)(event);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="question-prompt">{t("formQuestionPrompt")}</Label>
            <Input id="question-prompt" {...register("prompt")} />
            {formState.errors.prompt && <FieldError>{formState.errors.prompt.message}</FieldError>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="question-type">{t("formQuestionType")}</Label>
            <NativeSelect id="question-type" {...register("question_type")}>
              {QUESTION_TYPES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {QUESTION_TYPE_LABELS[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <label className="flex w-fit items-center gap-2 text-sm font-semibold">
            <input type="checkbox" {...register("required")} />
            {t("formQuestionRequired")}
          </label>
          {choiceType && (
            <div className="space-y-2">
              <Label>{t("formQuestionOptions")}</Label>
              {options.fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Input
                    aria-label={`${t("formQuestionOptions")} ${String(index + 1)}`}
                    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- rhf's field path needs the numeric index inline
                    {...register(`options.${index}.value` as const)}
                  />
                  <button
                    type="button"
                    aria-label={t("formQuestionRemoveOption")}
                    className="text-muted-foreground hover:bg-status-late-soft hover:text-status-late flex size-9 shrink-0 items-center justify-center rounded-md"
                    onClick={() => {
                      options.remove(index);
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  options.append({ value: "" });
                }}
              >
                <Plus aria-hidden="true" />
                {t("formQuestionAddOption")}
              </Button>
              {formState.errors.options && (
                <FieldError>
                  {formState.errors.options.message ?? formState.errors.options.root?.message}
                </FieldError>
              )}
            </div>
          )}
          {isError && <ErrorMessage>{t("formBuilderError")}</ErrorMessage>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("formQuestionCancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {t("formQuestionSave")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
