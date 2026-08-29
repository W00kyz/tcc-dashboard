import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { LoginPage } from "@/routes/LoginPage";

function renderLoginPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Builds a syntactically valid (unsigned) JWT carrying the given role claim, matching
 * what decodeJwtRole expects to parse off the access token's payload segment. */
function fakeAccessToken(role: string): string {
  const payload = btoa(JSON.stringify({ role }));

  return `header.${payload}.signature`;
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows the PU/UFCG wordmark", () => {
    renderLoginPage();

    expect(screen.getByText("PU · UFCG")).toBeInTheDocument();
  });

  it("shows a validation message for an invalid e-mail without submitting", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("E-mail"), "não-é-um-email");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Informe um e-mail válido.")).toBeInTheDocument();
  });

  it("shows an error message when the API rejects the credentials", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("E-mail"), "larissa@pu.ufcg.edu.br");
    await user.type(screen.getByLabelText("Senha"), "senha-errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByText("E-mail ou senha incorretos.")).toBeInTheDocument();
    });
  });

  it("stores the session decoded from the access token when the API accepts the credentials", async () => {
    const body = JSON.stringify({
      access_token: fakeAccessToken("MANAGER"),
      refresh_token: "a-refresh-token",
      token_type: "bearer",
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText("E-mail"), "larissa@pu.ufcg.edu.br");
    await user.type(screen.getByLabelText("Senha"), "senha-correta");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      const stored = localStorage.getItem("route-monitor.session");
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored ?? "{}")).toMatchObject({
        accessToken: fakeAccessToken("MANAGER"),
        refreshToken: "a-refresh-token",
        role: "MANAGER",
      });
    });
  });
});
