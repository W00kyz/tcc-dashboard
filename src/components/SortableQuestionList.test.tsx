import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { components } from "@/api/generated/schema";
import { SortableQuestionList } from "@/components/SortableQuestionList";

type FormQuestion = components["schemas"]["FormQuestionResponse"];

function makeQuestions(): FormQuestion[] {
  return [
    {
      id: "id1",
      stable_key: "q1",
      order_index: 0,
      prompt: "Primeira",
      question_type: "TEXT",
      required: true,
      options: [],
      content_hash: null,
    },
    {
      id: "id2",
      stable_key: "q2",
      order_index: 1,
      prompt: "Segunda",
      question_type: "SINGLE_CHOICE",
      required: false,
      options: ["A", "B"],
      content_hash: null,
    },
    {
      id: "id3",
      stable_key: "q3",
      order_index: 2,
      prompt: "Terceira",
      question_type: "NUMBER",
      required: false,
      options: [],
      content_hash: null,
    },
  ];
}

describe("SortableQuestionList", () => {
  it("reports the reordered stable keys through the keyboard drag sensor", async () => {
    const onReorder = vi.fn();
    const user = userEvent.setup();

    render(
      <SortableQuestionList
        questions={makeQuestions()}
        onReorder={onReorder}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const secondHandle = screen.getAllByRole("button", { name: "Reordenar pergunta" })[1];
    if (secondHandle === undefined) {
      throw new Error("expected three drag handles");
    }
    secondHandle.focus();
    await user.keyboard("{ }");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ }");

    expect(onReorder).toHaveBeenCalledWith(["q1", "q3", "q2"]);
  });

  it("renders the type badge, required badge and option chips", () => {
    render(
      <SortableQuestionList
        questions={makeQuestions()}
        onReorder={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("Obrigatória")).toBeInTheDocument();
    expect(screen.getByText("Escolha única")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("shows the empty state with no questions", () => {
    render(
      <SortableQuestionList
        questions={[]}
        onReorder={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("O rascunho ainda não tem perguntas.")).toBeInTheDocument();
  });
});
