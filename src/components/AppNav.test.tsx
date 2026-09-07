import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isValidElement } from "react";

import { appRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppNav } from "@/components/AppNav";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function makeFakeFetch(total = 0, unreadCount = 0) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.includes("/executions")) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], total, page: 1, page_size: 1 }), { status: 200 }),
      );
    }
    if (url.includes("/notifications/me/unread-count")) {
      return Promise.resolve(new Response(JSON.stringify({ count: unreadCount }), { status: 200 }));
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

  it("shows the notifications link for a manager", () => {
    renderNav("MANAGER", makeFakeFetch(0, 0));

    expect(screen.getByRole("link", { name: "Notificações" })).toBeInTheDocument();
  });

  it("renders the unread-notifications badge with the count when there are unread notifications", async () => {
    renderNav("MANAGER", makeFakeFetch(0, 3));

    const badge = await screen.findByRole("link", { name: /notificações não lidas/i });
    expect(badge).toHaveTextContent("3");
    expect(badge).toHaveAttribute("href", "/notificacoes");
  });

  it("renders no unread-notifications badge when the count is zero", async () => {
    renderNav("MANAGER", makeFakeFetch(0, 0));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Notificações" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /notificações não lidas/i })).not.toBeInTheDocument();
  });

  it("registers /notificacoes under the MANAGER/ADMIN ProtectedRoute", () => {
    const managerBranch = appRoutes.find((branch) =>
      branch.children?.some((child) => child.path === "/rotas"),
    );

    const branchElement = managerBranch?.element;
    expect(isValidElement(branchElement) && branchElement.type).toBe(ProtectedRoute);
    expect(managerBranch?.children?.map((child) => child.path)).toContain("/notificacoes");
  });
});
