import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { RouteBoardPage } from "@/routes/RouteBoardPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouteBoardPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("RouteBoardPage", () => {
  it("shows the empty-state message when there are no routes", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Nenhuma rota atribuída para hoje.")).toBeInTheDocument();
    });
  });

  it("shows one card per route, with the worker's name and the stop strip", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "r1",
            field_worker_name: "João da Silva",
            scheduled_start_at: null,
            started_at: "2026-08-25T08:15:00Z",
            stops: [{ id: "s1", order_index: 1, status: "DONE", service_point_name: "Sala 101" }],
          },
        ]),
        { status: 200 },
      ),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("João da Silva")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Ponto 1: Concluído")).toBeInTheDocument();
  });
});
