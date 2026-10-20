import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { FieldWorkersPage } from "@/routes/FieldWorkersPage";
import { FakeApi } from "@/test/fakeApi";
import { listItemWithText } from "@/test/queries";

const WORKER = {
  id: "w1",
  full_name: "João da Silva",
  email: "joao@ufcg.edu.br",
  contractor_company_id: "c1",
  contractor_company_name: "Limpa Tudo",
  status: "APPROVED",
  is_active: true,
  rejection_reason: null,
  created_at: "2026-10-01T00:00:00Z",
  done_today: 0,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  new FakeApi().on("GET", "/field-workers", [WORKER]).install();

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FieldWorkersPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("FieldWorkersPage", () => {
  it("lists field workers with their company name", async () => {
    renderPage();

    await screen.findByText("João da Silva");
    expect(within(listItemWithText("João da Silva")).getByText("Limpa Tudo")).toBeInTheDocument();
  });

  it("offers no way to register a worker by hand: they sign up from the app", async () => {
    renderPage();

    await screen.findByText("João da Silva");
    expect(screen.queryByRole("button", { name: "Novo profissional" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });
});
