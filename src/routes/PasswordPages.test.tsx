import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordPage } from "@/routes/ForgotPasswordPage";
import { ResetPasswordPage } from "@/routes/ResetPasswordPage";

function renderAt(path: string, page: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

async function requestBody(fakeFetch: ReturnType<typeof vi.fn>): Promise<unknown> {
  const request = fakeFetch.mock.calls[0]?.[0] as Request;

  return request.clone().json();
}

describe("ForgotPasswordPage (RF03)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests a reset link and confirms without revealing whether the e-mail exists", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    globalThis.fetch = fakeFetch;
    const user = userEvent.setup();
    renderAt("/esqueci-senha", <ForgotPasswordPage />);

    await user.type(screen.getByLabelText("E-mail"), "joao@empresa.com");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Se o e-mail estiver cadastrado");
    expect(await requestBody(fakeFetch)).toEqual({ email: "joao@empresa.com" });
  });
});

describe("ResetPasswordPage (RF03, RF05 invite)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the token from the link with the new password", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fakeFetch;
    const user = userEvent.setup();
    renderAt("/redefinir-senha?token=abc", <ResetPasswordPage />);

    await user.type(screen.getByLabelText("Nova senha"), "senha-forte-1");
    await user.type(screen.getByLabelText("Confirme a nova senha"), "senha-forte-1");
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Senha definida");
    expect(await requestBody(fakeFetch)).toEqual({ token: "abc", new_password: "senha-forte-1" });
  });

  it("blocks a mismatched confirmation before calling the API", async () => {
    const fakeFetch = vi.fn();
    globalThis.fetch = fakeFetch;
    const user = userEvent.setup();
    renderAt("/redefinir-senha?token=abc", <ResetPasswordPage />);

    await user.type(screen.getByLabelText("Nova senha"), "senha-forte-1");
    await user.type(screen.getByLabelText("Confirme a nova senha"), "outra-senha-2");
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));

    expect(await screen.findByText("As senhas não conferem.")).toBeInTheDocument();
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("explains an expired link", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const user = userEvent.setup();
    renderAt("/redefinir-senha?token=velho", <ResetPasswordPage />);

    await user.type(screen.getByLabelText("Nova senha"), "senha-forte-1");
    await user.type(screen.getByLabelText("Confirme a nova senha"), "senha-forte-1");
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Link inválido ou expirado");
  });

  it("flags a link without a token", () => {
    renderAt("/redefinir-senha", <ResetPasswordPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("Este link está incompleto");
  });
});
