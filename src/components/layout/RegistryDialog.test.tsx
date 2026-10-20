import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RegistryDialog, useRegistryDialog } from "@/components/layout/RegistryDialog";
import { RegistrySaveError } from "@/components/layout/registryForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Dialog = ReturnType<typeof useRegistryDialog<{ name: string }>>;

function idleSave(overrides: Partial<{ isPending: boolean; error: Error | null }> = {}) {
  return { isPending: false, error: null, reset: vi.fn(), ...overrides };
}

function NameDialog({
  dialog,
  onSubmit = vi.fn(),
  save = idleSave(),
}: {
  dialog: Dialog;
  onSubmit?: () => void;
  save?: ReturnType<typeof idleSave>;
}) {
  return (
    <RegistryDialog
      dialog={dialog}
      save={save}
      onSubmit={onSubmit}
      createLabel="Cadastrar"
      fieldLabels={{ name: "Nome" }}
    >
      <Label htmlFor="name">Nome</Label>
      <Input
        id="name"
        value={dialog.form.values.name}
        onChange={(event) => {
          dialog.form.setField("name", event.target.value);
        }}
      />
    </RegistryDialog>
  );
}

function renderDialog(props: Omit<Parameters<typeof NameDialog>[0], "dialog"> = {}) {
  const hook = renderHook(() => useRegistryDialog({ name: "" }, ["name"]));
  const view = render(<NameDialog dialog={hook.result.current} {...props} />);
  const rerender = () => {
    view.rerender(<NameDialog dialog={hook.result.current} {...props} />);
  };

  return { hook, rerender };
}

describe("RegistryDialog", () => {
  it("opens blank for a new record and submits once the fields are filled", async () => {
    const onSubmit = vi.fn();
    const { hook, rerender } = renderDialog({ onSubmit });

    act(() => {
      hook.result.current.openNew();
    });
    rerender();
    expect(screen.getByRole("dialog", { name: "Novo cadastro" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    rerender();
    expect(screen.getByRole("alert")).toHaveTextContent("Nome");
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Nome"), "Bloco CI");
    rerender();
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("opens filled to edit a record and offers 'Salvar alterações'", () => {
    const { hook, rerender } = renderDialog();

    act(() => {
      hook.result.current.openEdit("b1", { name: "Bloco CI" });
    });
    rerender();

    expect(screen.getByRole("dialog", { name: "Editar cadastro" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toHaveValue("Bloco CI");
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeInTheDocument();
  });

  it("closes on Cancelar and starts blank the next time", async () => {
    const save = idleSave();
    const { hook, rerender } = renderDialog({ save });
    act(() => {
      hook.result.current.openEdit("b1", { name: "Bloco CI" });
    });
    rerender();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    rerender();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(save.reset).toHaveBeenCalled();

    act(() => {
      hook.result.current.openNew();
    });
    rerender();
    expect(screen.getByLabelText("Nome")).toHaveValue("");
  });

  it("stays open and says so when the save fails", () => {
    const { hook, rerender } = renderDialog({
      save: idleSave({ error: new RegistrySaveError(409, "POST /x") }),
    });
    act(() => {
      hook.result.current.openNew();
    });
    rerender();

    expect(screen.getByRole("alert")).toHaveTextContent("Já existe um cadastro com esses dados.");
  });
});
