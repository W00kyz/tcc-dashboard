import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuestionEditorDialog } from "@/components/QuestionEditorDialog";

describe("QuestionEditorDialog", () => {
  it("offers a photo question with no options to fill", async () => {
    const onSubmit = vi.fn();
    render(
      <QuestionEditorDialog
        open
        onOpenChange={vi.fn()}
        initialValue={null}
        onSubmit={onSubmit}
        isPending={false}
        isError={false}
      />,
    );

    await userEvent.type(screen.getByLabelText("Enunciado"), "Foto do piso após a limpeza");
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "MEDIA");
    expect(screen.queryByText("Opções")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Salvar pergunta" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Foto do piso após a limpeza",
        question_type: "MEDIA",
        options: [],
      }),
    );
  });
});
