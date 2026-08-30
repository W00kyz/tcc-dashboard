import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { FieldWorkersPage } from "@/routes/FieldWorkersPage";

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FieldWorkersPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

// Every test hits the four GET queries the page fires on mount, in the order the
// component declares them: field workers, contractor companies, service types, users.
function mockListResponses({
  workers = [],
  companies = [],
  serviceTypes = [],
  users = [],
}: {
  workers?: unknown[];
  companies?: unknown[];
  serviceTypes?: unknown[];
  users?: unknown[];
}) {
  return vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(workers), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(companies), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(serviceTypes), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(users), { status: 200 }));
}

describe("FieldWorkersPage", () => {
  it("lists field workers with their company name", async () => {
    const fakeFetch = mockListResponses({
      workers: [
        {
          id: "w1",
          full_name: "João da Silva",
          contractor_company_id: "c1",
          service_type_ids: ["s1"],
          user_id: null,
        },
      ],
      companies: [{ id: "c1", name: "Limpa Tudo", cnpj: "12345678000199" }],
      serviceTypes: [{ id: "s1", name: "Limpeza", average_duration_minutes: 30 }],
    });

    renderPage(fakeFetch);

    await waitFor(() => {
      expect(screen.getByText("João da Silva")).toBeInTheDocument();
    });
    const worker = screen.getByText("João da Silva").closest("li");
    if (worker === null) {
      throw new Error("expected the worker's list item to have a <li> ancestor");
    }
    expect(within(worker).getByText("Limpa Tudo")).toBeInTheDocument();
  });

  it("offers only FIELD_WORKER-role users not already linked to a worker for linking", async () => {
    const fakeFetch = mockListResponses({
      workers: [
        {
          id: "w1",
          full_name: "João da Silva",
          contractor_company_id: "c1",
          service_type_ids: [],
          user_id: "u1",
        },
      ],
      companies: [{ id: "c1", name: "Limpa Tudo", cnpj: "12345678000199" }],
      users: [
        {
          id: "u1",
          name: "Usuário Já Vinculado",
          email: "u1@example.com",
          role: "FIELD_WORKER",
          is_active: true,
        },
        {
          id: "u2",
          name: "Maria Souza",
          email: "u2@example.com",
          role: "FIELD_WORKER",
          is_active: true,
        },
        {
          id: "u3",
          name: "Gestora Ana",
          email: "u3@example.com",
          role: "MANAGER",
          is_active: true,
        },
      ],
    });

    renderPage(fakeFetch);

    const linkedUserSelect = await screen.findByLabelText("Vincular usuário de login (opcional)");
    await waitFor(() => {
      expect(within(linkedUserSelect).getByText(/Maria Souza/)).toBeInTheDocument();
    });
    expect(within(linkedUserSelect).queryByText(/Usuário Já Vinculado/)).not.toBeInTheDocument();
    expect(within(linkedUserSelect).queryByText(/Gestora Ana/)).not.toBeInTheDocument();
  });

  it("submits the create-field-worker form with the selected service types", async () => {
    const fakeFetch = mockListResponses({
      companies: [{ id: "c1", name: "Limpa Tudo", cnpj: "12345678000199" }],
      serviceTypes: [{ id: "s1", name: "Limpeza", average_duration_minutes: 30 }],
    });
    fakeFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "w2",
          full_name: "Pedro Alves",
          contractor_company_id: "c1",
          service_type_ids: ["s1"],
          user_id: null,
        }),
        { status: 201 },
      ),
    );
    fakeFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const { default: userEvent } = await import("@testing-library/user-event");

    renderPage(fakeFetch);
    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(4);
    });

    await userEvent.type(screen.getByLabelText("Nome completo"), "Pedro Alves");
    await userEvent.selectOptions(screen.getByLabelText("Empresa terceirizada"), "c1");
    await userEvent.selectOptions(screen.getByLabelText("Tipos de serviço"), "s1");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(6);
    });
    // openapi-fetch calls the injected fetch with a single Request object rather than a
    // (url, init) pair, so the submitted body has to be read off that Request's own clone.
    const submitCall = fakeFetch.mock.calls.find(
      ([request]) => (request as Request).method === "POST",
    );
    if (submitCall === undefined) {
      throw new Error("expected a POST request to /field-workers among the fake fetch calls");
    }
    const body = (await (submitCall[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).toEqual({
      full_name: "Pedro Alves",
      contractor_company_id: "c1",
      service_type_ids: ["s1"],
      user_id: null,
    });
  });
});
