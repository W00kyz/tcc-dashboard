import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DeleteConfirmDialog } from "@/components/buildings/DeleteConfirmDialog";

const IMPACT = { points: 3, floors: 1, routes: 2, executions: 1, photos: 0 };

function renderDialog(onConfirm: () => Promise<void>, onDeleted = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Remover Bloco CI?"
        impactKey="b1"
        loadImpact={() => Promise.resolve(IMPACT)}
        onConfirm={onConfirm}
        onDeleted={onDeleted}
      />
    </QueryClientProvider>,
  );

  return onDeleted;
}

describe("DeleteConfirmDialog", () => {
  it("lists what goes with the record before anything is removed", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    renderDialog(onConfirm);

    const dialog = await screen.findByRole("dialog", { name: "Remover Bloco CI?" });
    expect(await screen.findByText("1 andar")).toBeInTheDocument();
    expect(screen.getByText("3 pontos de serviço")).toBeInTheDocument();
    expect(screen.getByText("2 rotas")).toBeInTheDocument();
    expect(screen.getByText("1 execução")).toBeInTheDocument();
    // Nothing of a kind: not listed.
    expect(screen.queryByText(/fotos?$/)).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent("Esta ação não pode ser desfeita.");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("removes on confirmation and reports it", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    const onDeleted = renderDialog(onConfirm);

    await userEvent.click(await screen.findByRole("button", { name: "Remover" }));

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });
  });

  it("says so when the removal fails", async () => {
    renderDialog(() => Promise.reject(new Error("boom")));

    await userEvent.click(await screen.findByRole("button", { name: "Remover" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível remover");
  });
});
