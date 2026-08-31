import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { UsersPage } from "@/routes/UsersPage";

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UsersPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("UsersPage", () => {
  it("lists the existing users", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "u1",
            name: "Larissa Almeida",
            email: "larissa@pu.ufcg.edu.br",
            role: "MANAGER",
            is_active: true,
          },
        ]),
        { status: 200 },
      ),
    );

    renderPage(fakeFetch);

    await waitFor(() => {
      expect(screen.getByText("Larissa Almeida")).toBeInTheDocument();
    });
  });

  it("submits the create-user form", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "u2",
            name: "João Silva",
            email: "joao@pu.ufcg.edu.br",
            role: "FIELD_WORKER",
            is_active: true,
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const { default: userEvent } = await import("@testing-library/user-event");

    renderPage(fakeFetch);
    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    await userEvent.type(screen.getByLabelText("Nome"), "João Silva");
    await userEvent.type(screen.getByLabelText("E-mail"), "joao@pu.ufcg.edu.br");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(3);
    });
  });

  it("resets the role selector to Field Worker after a successful create", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "u3",
            name: "Ana Souza",
            email: "ana@pu.ufcg.edu.br",
            role: "ADMIN",
            is_active: true,
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const { default: userEvent } = await import("@testing-library/user-event");

    renderPage(fakeFetch);
    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    const roleSelect = screen.getByLabelText<HTMLSelectElement>("Perfil");
    await userEvent.type(screen.getByLabelText("Nome"), "Ana Souza");
    await userEvent.type(screen.getByLabelText("E-mail"), "ana@pu.ufcg.edu.br");
    await userEvent.selectOptions(roleSelect, "ADMIN");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(3);
    });
    expect(roleSelect.value).toBe("FIELD_WORKER");
  });
});
