import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { components } from "@/api/generated/schema";
import { strings } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/StateMessages";

type FormQuestion = components["schemas"]["FormQuestionResponse"];
type QuestionType = components["schemas"]["QuestionType"];

// The <select> in QuestionEditorDialog and this badge share one source of labels so a row
// and its editor never disagree on what "SINGLE_CHOICE" reads as in pt-BR.
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  TEXT: strings.formQuestionTypeText,
  NUMBER: strings.formQuestionTypeNumber,
  BOOLEAN: strings.formQuestionTypeBoolean,
  SINGLE_CHOICE: strings.formQuestionTypeSingleChoice,
  MULTI_CHOICE: strings.formQuestionTypeMultiChoice,
  MEDIA: strings.formQuestionTypeMedia,
};

interface SortableQuestionListProps {
  questions: FormQuestion[];
  onReorder: (stableKeys: string[]) => void;
  onEdit: (question: FormQuestion) => void;
  onRemove: (stableKey: string) => void;
}

interface SortableQuestionRowProps {
  question: FormQuestion;
  onEdit: (question: FormQuestion) => void;
  onRemove: (stableKey: string) => void;
}

function SortableQuestionRow({ question, onEdit, onRemove }: SortableQuestionRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id: question.stable_key });

  return (
    <li
      ref={setNodeRef}
      className="bg-card flex items-start gap-2 py-3"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* Dual-sensor handle contract: PointerSensor for the mouse,
          KeyboardSensor for Space-grab / Arrow-move / Space-drop, dnd-kit owns the keydown. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={t("formBuilderDragHandle")}
        className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      <div className="min-w-0 flex-1 space-y-1.5 pt-1">
        <p className="text-foreground font-semibold">{question.prompt}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="plate">{QUESTION_TYPE_LABELS[question.question_type]}</Badge>
          {question.required && <Badge variant="progress">{t("formBuilderRequiredBadge")}</Badge>}
          {question.options.map((option) => (
            <Badge key={option} variant="outline" className="font-normal">
              {option}
            </Badge>
          ))}
        </div>
      </div>
      <button
        type="button"
        aria-label={t("formBuilderEditQuestion")}
        className="text-muted-foreground hover:text-foreground hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-md"
        onClick={() => {
          onEdit(question);
        }}
      >
        <Pencil aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        aria-label={t("formBuilderRemoveQuestion")}
        className="text-muted-foreground hover:bg-status-late-soft hover:text-status-late flex size-8 shrink-0 items-center justify-center rounded-md"
        onClick={() => {
          onRemove(question.stable_key);
        }}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

export function SortableQuestionList({
  questions,
  onReorder,
  onEdit,
  onRemove,
}: SortableQuestionListProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over === null || active.id === over.id) {
      return;
    }
    const from = questions.findIndex((question) => question.stable_key === active.id);
    const to = questions.findIndex((question) => question.stable_key === over.id);
    onReorder(arrayMove(questions, from, to).map((question) => question.stable_key));
  }

  if (questions.length === 0) {
    return <EmptyState>{t("formBuilderEmptyDraft")}</EmptyState>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={questions.map((question) => question.stable_key)}
        strategy={verticalListSortingStrategy}
      >
        <ol className="divide-y">
          {questions.map((question) => (
            <SortableQuestionRow
              key={question.stable_key}
              question={question}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
