import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { FieldWorkersPage } from "@/routes/FieldWorkersPage";
import { FakeApi } from "@/test/fakeApi";
import { listItemWithText } from "@/test/queries";

function worker(overrides: Record<string, unknown>) {
  return {
    id: "w1",
    full_name: "João da Silva",
    email: "joao@ufcg.edu.br",
    contractor_company_id: "c1",
    contractor_company_name: "Limpa Tudo",
    status: "APPROVED",
    is_active: true,
    rejection_reason: null,
    created_at: "2026-10-01T12:00:00Z",
    done_today: 3,
    ...overrides,
  };
}

const JOAO = worker({});
const PEDRO = worker({
  id: "w2",
  full_name: "Pedro Alves",
  email: "pedro@ufcg.edu.br",
  contractor_company_id: "c2",
  contractor_company_name: "Zelo Serviços",
  is_active: false,
  done_today: 0,
});
const MARIA = worker({
  id: "w3",
  full_name: "Maria Souza",
  email: "maria@ufcg.edu.br",
  status: "PENDING_APPROVAL",
  done_today: 0,
});
const ANA = worker({
  id: "w4",
  full_name: "Ana Lima",
  email: "ana@ufcg.edu.br",
  status: "REJECTED",
  rejection_reason: "Documento ilegível",
  done_today: 0,
});

function renderPage(api: FakeApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.install();

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FieldWorkersPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function apiWith(workers: unknown[]) {
  return new FakeApi().on("GET", "/field-workers", workers);
}

describe("FieldWorkersPage", () => {
  it("groups workers by company", async () => {
    renderPage(apiWith([JOAO, PEDRO, MARIA]));

    const limpa = (await screen.findByRole("heading", { name: "Limpa Tudo" })).closest("section");
    const zelo = screen.getByRole("heading", { name: "Zelo Serviços" }).closest("section");
    if (limpa === null || zelo === null) {
      throw new Error("expected one section per company");
    }

    const joao = listItemWithTextIn(limpa, "João da Silva");
    expect(within(joao).getByText("joao@ufcg.edu.br")).toBeInTheDocument();
    expect(within(joao).getByText("Ativo")).toBeInTheDocument();
    expect(within(joao).getByText("Feitos hoje: 3")).toBeInTheDocument();
    expect(within(limpa).queryByText("Pedro Alves")).not.toBeInTheDocument();

    const pedro = listItemWithTextIn(zelo, "Pedro Alves");
    expect(within(pedro).getByText("Desativado")).toBeInTheDocument();
    expect(within(pedro).getByRole("button", { name: "Reativar Pedro Alves" })).toBeInTheDocument();
    // A pending worker waits in its own section, not among the company's workers.
    expect(within(limpa).queryByText("Maria Souza")).not.toBeInTheDocument();
  });

  it("lists who awaits approval with company and registration date", async () => {
    renderPage(apiWith([JOAO, MARIA]));

    await screen.findByRole("heading", { name: "Aguardando aprovação" });
    const maria = listItemWithText("Maria Souza");
    expect(within(maria).getByText("maria@ufcg.edu.br")).toBeInTheDocument();
    expect(within(maria).getByText("Limpa Tudo")).toBeInTheDocument();
    expect(within(maria).getByText("Cadastrado em 01/10/2026")).toBeInTheDocument();
  });

  it("hides the pending section when nobody waits", async () => {
    renderPage(apiWith([JOAO]));

    await screen.findByText("João da Silva");
    expect(screen.queryByRole("heading", { name: "Aguardando aprovação" })).not.toBeInTheDocument();
  });

  it("approve moves worker out of pending", async () => {
    const user = userEvent.setup();
    let approved = false;
    const api = new FakeApi()
      .onRequest("GET", "/field-workers", () => [
        JOAO,
        approved ? { ...MARIA, status: "APPROVED" } : MARIA,
      ])
      .onRequest("POST", "/field-workers/w3/approve", () => {
        approved = true;

        return { ...MARIA, status: "APPROVED" };
      });
    renderPage(api);

    await user.click(await screen.findByRole("button", { name: "Aprovar Maria Souza" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Aguardando aprovação" }),
      ).not.toBeInTheDocument();
    });
    expect(api.sent("POST", "/field-workers/w3/approve")).toHaveLength(1);
    expect(within(listItemWithText("Maria Souza")).getByText("Ativo")).toBeInTheDocument();
  });

  it("reject sends optional reason", async () => {
    const user = userEvent.setup();
    const api = apiWith([MARIA]).on("POST", "/field-workers/w3/reject", {
      ...MARIA,
      status: "REJECTED",
    });
    renderPage(api);

    await user.click(await screen.findByRole("button", { name: "Reprovar Maria Souza" }));
    const dialog = await screen.findByRole("dialog", { name: "Reprovar cadastro" });
    await user.type(within(dialog).getByLabelText("Motivo (opcional)"), "Sem vínculo");
    await user.click(within(dialog).getByRole("button", { name: "Reprovar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/field-workers/w3/reject")).toHaveLength(1);
    });
    expect(api.sent("POST", "/field-workers/w3/reject")[0]?.body).toEqual({
      reason: "Sem vínculo",
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("reject without a reason sends null and caps the reason at 300 characters", async () => {
    const user = userEvent.setup();
    const api = apiWith([MARIA]).on("POST", "/field-workers/w3/reject", MARIA);
    renderPage(api);

    await user.click(await screen.findByRole("button", { name: "Reprovar Maria Souza" }));
    const dialog = await screen.findByRole("dialog", { name: "Reprovar cadastro" });
    expect(within(dialog).getByLabelText("Motivo (opcional)")).toHaveAttribute("maxlength", "300");
    await user.click(within(dialog).getByRole("button", { name: "Reprovar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/field-workers/w3/reject")[0]?.body).toEqual({ reason: null });
    });
  });

  it("deactivate asks confirmation", async () => {
    const user = userEvent.setup();
    const api = apiWith([JOAO]).on("POST", "/field-workers/w1/deactivate", {
      ...JOAO,
      is_active: false,
    });
    renderPage(api);

    await user.click(await screen.findByRole("button", { name: "Desativar João da Silva" }));
    expect(api.sent("POST", "/field-workers/w1/deactivate")).toHaveLength(0);
    const dialog = await screen.findByRole("dialog", { name: "Desativar João da Silva?" });
    await user.click(within(dialog).getByRole("button", { name: "Desativar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/field-workers/w1/deactivate")).toHaveLength(1);
    });
  });

  it("reactivate asks confirmation too", async () => {
    const user = userEvent.setup();
    const api = apiWith([PEDRO]).on("POST", "/field-workers/w2/reactivate", PEDRO);
    renderPage(api);

    await user.click(await screen.findByRole("button", { name: "Reativar Pedro Alves" }));
    expect(api.sent("POST", "/field-workers/w2/reactivate")).toHaveLength(0);
    const dialog = await screen.findByRole("dialog", { name: "Reativar Pedro Alves?" });
    await user.click(within(dialog).getByRole("button", { name: "Reativar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/field-workers/w2/reactivate")).toHaveLength(1);
    });
  });

  it("keeps rejected workers in a collapsed section with the reason and Aprovar", async () => {
    const user = userEvent.setup();
    const api = apiWith([ANA]).on("POST", "/field-workers/w4/approve", ANA);
    renderPage(api);

    const toggle = await screen.findByRole("button", { name: /Reprovados/ });
    expect(screen.queryByText("Ana Lima")).not.toBeInTheDocument();
    await user.click(toggle);

    const ana = listItemWithText("Ana Lima");
    expect(within(ana).getByText("Motivo: Documento ilegível")).toBeInTheDocument();
    await user.click(within(ana).getByRole("button", { name: "Aprovar Ana Lima" }));
    await waitFor(() => {
      expect(api.sent("POST", "/field-workers/w4/approve")).toHaveLength(1);
    });
  });

  it("explains a status conflict and refreshes the list", async () => {
    const user = userEvent.setup();
    const api = apiWith([MARIA]).on(
      "POST",
      "/field-workers/w3/approve",
      { detail: { code: "INVALID_WORKER_STATUS", detail: "Worker is not pending." } },
      409,
    );
    renderPage(api);

    await user.click(await screen.findByRole("button", { name: "Aprovar Maria Souza" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este cadastro já foi tratado por outra pessoa. A lista foi atualizada.",
    );
    await waitFor(() => {
      expect(api.sent("GET", "/field-workers")).toHaveLength(2);
    });
  });

  it("no create button", async () => {
    renderPage(apiWith([JOAO]));

    await screen.findByText("João da Silva");
    expect(screen.queryByRole("button", { name: "Novo profissional" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });
});

function listItemWithTextIn(section: HTMLElement, text: string): HTMLElement {
  const row = within(section)
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(text) !== null);
  if (row === undefined) {
    throw new Error(`No list item in the section shows "${text}".`);
  }

  return row;
}
