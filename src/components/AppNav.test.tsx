import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { AppNav } from "@/components/AppNav";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function makeFakeFetch(total = 0) {
  return vi.fn((input: RequestInfo | URL) => {
    if (requestUrl(input).includes("/executions")) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], total, page: 1, page_size: 1 }), { status: 200 }),
      );
    }

    return Promise.resolve(new Response("{}", { status: 200 }));
  });
}

function renderNav(role: string, fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);
  localStorage.setItem(
    "route-monitor.session",
    JSON.stringify({ accessToken: "t", refreshToken: "r", role }),
  );

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppNav />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("AppNav", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the executions link for a manager but hides the admin-only settings link", () => {
    renderNav("MANAGER", makeFakeFetch(0));

    expect(screen.getByRole("link", { name: "Execuções" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Configurações" })).not.toBeInTheDocument();
  });

  it("shows the settings link for an admin", () => {
    renderNav("ADMIN", makeFakeFetch(0));

    expect(screen.getByRole("link", { name: "Configurações" })).toBeInTheDocument();
  });

  it("renders the review-queue badge linking to the pending filter when the queue is not empty", async () => {
    renderNav("MANAGER", makeFakeFetch(4));

    const badge = await screen.findByRole("link", { name: /fila de revisão/i });
    expect(badge).toHaveTextContent("4");
    expect(badge).toHaveAttribute("href", "/execucoes?review_status=PENDING_REVIEW");
  });

  it("renders no badge when the review queue is empty", async () => {
    renderNav("MANAGER", makeFakeFetch(0));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Execuções" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /fila de revisão/i })).not.toBeInTheDocument();
  });
});
