import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { MyDataPage } from "@/routes/MyDataPage";

const FULL_PAYLOAD = {
  profile: {
    id: "u1",
    email: "joao@ufcg.edu.br",
    name: "João da Silva",
    role: "FIELD_WORKER",
    is_active: true,
    created_at: "2026-01-10T09:00:00Z",
  },
  field_worker: {
    id: "w1",
    full_name: "João da Silva",
    contractor_company_id: "c1",
    service_type_ids: ["st1", "st2"],
  },
  consent_history: [{ notice_version: 2, accepted_at: "2026-02-01T12:00:00Z" }],
  auth_events: [
    { event: "LOGIN_SUCCESS", ip_address: "203.0.113.5", created_at: "2026-09-01T08:00:00Z" },
  ],
  executions_summary: {
    total: 7,
    first_at: "2026-03-01T08:00:00Z",
    last_at: "2026-08-30T18:00:00Z",
  },
  evidence_summary: { total_items: 3, total_bytes: 1500 },
  positions_summary: {
    total: 42,
    first_at: "2026-03-01T08:00:00Z",
    last_at: "2026-08-30T18:00:00Z",
  },
  notifications_summary: { total: 5, unread: 1 },
};

const EMPTY_PAYLOAD = {
  profile: {
    id: "u2",
    email: "novo@ufcg.edu.br",
    name: "Novo Usuário",
    role: "MANAGER",
    is_active: false,
    created_at: "2026-09-01T09:00:00Z",
  },
  field_worker: null,
  consent_history: [],
  auth_events: [],
  executions_summary: { total: 0, first_at: null, last_at: null },
  evidence_summary: { total_items: 0, total_bytes: 0 },
  positions_summary: { total: 0, first_at: null, last_at: null },
  notifications_summary: { total: 0, unread: 0 },
};

function renderPage(payload: unknown) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }))),
  );
  localStorage.setItem(
    "route-monitor.session",
    JSON.stringify({ accessToken: "t", refreshToken: "r", role: "FIELD_WORKER" }),
  );

  return render(
    <MemoryRouter initialEntries={["/meus-dados"]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MyDataPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("MyDataPage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders every personal-data section", async () => {
    renderPage(FULL_PAYLOAD);

    expect(await screen.findByText("joao@ufcg.edu.br")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/Versão do aviso\s*2/)).toBeInTheDocument();
    expect(screen.getByText("LOGIN_SUCCESS")).toBeInTheDocument();
  });

  it("shows the empty-state string and never renders undefined/NaN", async () => {
    const { container } = renderPage(EMPTY_PAYLOAD);

    expect(await screen.findByText("novo@ufcg.edu.br")).toBeInTheDocument();
    expect(screen.getAllByText("Nenhum registro.").length).toBeGreaterThan(0);
    expect(screen.getByText("Nenhum vínculo profissional.")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });
});
