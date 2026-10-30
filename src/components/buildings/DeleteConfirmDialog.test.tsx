import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DeleteConfirmDialog,
  type DeletionImpact,
} from "@/components/buildings/DeleteConfirmDialog";

const IMPACT: DeletionImpact = {
  points: 3,
  floors: 1,
  rooms: 0,
  routes: 2,
  executions: 1,
  photos: 0,
  appeals: 0,
};

function renderDialog(
  onConfirm: () => Promise<void>,
  onDeleted = vi.fn(),
  { impact = IMPACT, omit }: { impact?: DeletionImpact; omit?: (keyof DeletionImpact)[] } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DeleteConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Remover Bloco CI?"
        impactKey="b1"
        loadImpact={() => Promise.resolve(impact)}
        onConfirm={onConfirm}
        onDeleted={onDeleted}
        omit={omit}
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

  it("lists the rooms right after the floors, singular and plural", async () => {
    renderDialog(vi.fn(), vi.fn(), { impact: { ...IMPACT, rooms: 2 } });

    const items = await screen.findAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "1 andar",
      "2 salas",
      "3 pontos de serviço",
      "2 rotas",
      "1 execução",
    ]);
  });

  it('says "1 sala" for a single room', async () => {
    renderDialog(vi.fn(), vi.fn(), { impact: { ...IMPACT, rooms: 1 } });
    expect(await screen.findByText("1 sala")).toBeInTheDocument();
  });

  it("does not list rooms when there are none", async () => {
    renderDialog(vi.fn());

    await screen.findByText("1 andar");
    expect(screen.queryByText(/salas?$/)).not.toBeInTheDocument();
  });

  it("hides the kinds listed in omit, so a removal does not echo itself", async () => {
    renderDialog(vi.fn(), vi.fn(), { omit: ["floors"] });

    expect(await screen.findByText("3 pontos de serviço")).toBeInTheDocument();
    expect(screen.queryByText("1 andar")).not.toBeInTheDocument();
  });

  it("says nothing else goes when only the omitted kind remains", async () => {
    const alone = { ...IMPACT, points: 0, routes: 0, executions: 0 };
    renderDialog(vi.fn(), vi.fn(), { impact: alone, omit: ["floors"] });

    expect(await screen.findByText("Nada mais será removido junto.")).toBeInTheDocument();
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
