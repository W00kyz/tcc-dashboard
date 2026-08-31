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
// component declares them: field workers, contractor companies, service types,
// linkable users (Finding C2 — GET /field-workers/linkable-users, not GET /users).
function mockListResponses({
  workers = [],
  companies = [],
  serviceTypes = [],
  linkableUsers = [],
}: {
  workers?: unknown[];
  companies?: unknown[];
  serviceTypes?: unknown[];
  linkableUsers?: unknown[];
}) {
  return vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(workers), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(companies), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(serviceTypes), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(linkableUsers), { status: 200 }));
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

  // Finding C2: the dropdown used to fetch the full GET /users list (Admin-only) and filter
  // it client-side to FIELD_WORKER-role, not-yet-linked users — a Manager (who owns this
  // whole screen) got a silent 403 there and an empty dropdown. GET /field-workers/
  // linkable-users is Manager-or-Admin and does that filtering server-side, so this test only
  // needs to confirm the dropdown renders exactly what that endpoint returns — there is no
  // client-side filter left to exercise.
  it("populates the linked-user dropdown from GET /field-workers/linkable-users", async () => {
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
      linkableUsers: [{ id: "u2", name: "Maria Souza", email: "u2@example.com" }],
    });

    renderPage(fakeFetch);

    const linkedUserSelect = await screen.findByLabelText("Vincular usuário de login (opcional)");
    await waitFor(() => {
      expect(within(linkedUserSelect).getByText(/Maria Souza/)).toBeInTheDocument();
    });
    // The already-linked worker and any non-FIELD_WORKER user were never in the mocked
    // response to begin with — the backend excludes them, not this component — so the only
    // thing left to prove client-side is that nothing else got added on top of the response.
    expect(within(linkedUserSelect).getAllByRole("option")).toHaveLength(2); // "Nenhum" + u2

    // Confirms the fix at the network level: exactly one GET went to
    // /field-workers/linkable-users, and GET /users (Admin-only, the endpoint that used to
    // 403 for a Manager) was never called at all.
    const requestedPaths = fakeFetch.mock.calls.map(
      ([request]) => new URL((request as Request).url).pathname,
    );
    expect(requestedPaths).toContain("/field-workers/linkable-users");
    expect(requestedPaths).not.toContain("/users");
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
    // Two refetches after the mutation: react-query's invalidateQueries({ queryKey:
    // ["field-workers"] }) matches by prefix, not exact key, so it also refetches
    // ["field-workers", "linkable-users"] (Finding C2's query) alongside ["field-workers"]
    // itself — correct, since a newly-created worker can change who still counts as
    // "linkable".
    fakeFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
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
      expect(fakeFetch).toHaveBeenCalledTimes(7);
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
