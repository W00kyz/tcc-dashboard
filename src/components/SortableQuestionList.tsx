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
      className="flex items-start gap-2 py-2"
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {/* Same dual-sensor handle contract as SortableStopList: PointerSensor for the mouse,
          KeyboardSensor for Space-grab / Arrow-move / Space-drop, dnd-kit owns the keydown. */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={t("formBuilderDragHandle")}
        className="text-muted-foreground cursor-grab px-1"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <div className="flex-1 space-y-1">
        <p className="font-medium">{question.prompt}</p>
        <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full border px-2 py-0.5">
            {QUESTION_TYPE_LABELS[question.question_type]}
          </span>
          {question.required && (
            <span className="rounded-full border px-2 py-0.5">{t("formBuilderRequiredBadge")}</span>
          )}
          {question.options.map((option) => (
            <span key={option} className="bg-muted rounded-full px-2 py-0.5">
              {option}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        aria-label={t("formBuilderEditQuestion")}
        className="px-2 text-sm"
        onClick={() => {
          onEdit(question);
        }}
      >
        ✎
      </button>
      <button
        type="button"
        aria-label={t("formBuilderRemoveQuestion")}
        className="text-destructive px-2"
        onClick={() => {
          onRemove(question.stable_key);
        }}
      >
        ×
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
    return <p className="text-muted-foreground">{t("formBuilderEmptyDraft")}</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={questions.map((question) => question.stable_key)}
        strategy={verticalListSortingStrategy}
      >
        <ol className="divide-border divide-y">
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
