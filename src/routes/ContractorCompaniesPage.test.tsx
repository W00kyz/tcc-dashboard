import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ContractorCompaniesPage } from "@/routes/ContractorCompaniesPage";

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ContractorCompaniesPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("ContractorCompaniesPage", () => {
  it("lists existing contractor companies", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { id: "c1", name: "Limpa Tudo Terceirizados Ltda", cnpj: "12345678000199" },
          ]),
          { status: 200 },
        ),
      );

    renderPage(fakeFetch);

    await waitFor(() => {
      expect(screen.getByText("Limpa Tudo Terceirizados Ltda")).toBeInTheDocument();
    });
  });

  it("submits the create-contractor-company form", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "c2", name: "Verde Jardins Ltda", cnpj: "98765432000188" }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const { default: userEvent } = await import("@testing-library/user-event");

    renderPage(fakeFetch);
    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    await userEvent.type(screen.getByLabelText("Nome"), "Verde Jardins Ltda");
    await userEvent.type(screen.getByLabelText("CNPJ"), "98765432000188");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(3);
    });
    // openapi-fetch calls the injected fetch with a single Request object rather than a
    // (url, init) pair, so the submitted body has to be read off that Request's own clone.
    const submitCall = fakeFetch.mock.calls.find(
      ([request]) => (request as Request).method === "POST",
    );
    if (submitCall === undefined) {
      throw new Error(
        "expected a POST request to /contractor-companies among the fake fetch calls",
      );
    }
    const body = (await (submitCall[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).toEqual({ name: "Verde Jardins Ltda", cnpj: "98765432000188" });
  });
});
