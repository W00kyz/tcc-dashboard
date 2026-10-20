import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isValidElement, type ReactNode } from "react";

import { appRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { ConsentGate } from "@/auth/ConsentGate";
import { ProtectedRoute } from "@/auth/ProtectedRoute";
import { AppShell } from "@/components/shell/AppShell";

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

function renderNav(role: string, fetchImpl: typeof fetch, path = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);
  localStorage.setItem(
    "route-monitor.session",
    JSON.stringify({ accessToken: "t", refreshToken: "r", role }),
  );

  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

// Folded modules are opened the way a user would: by their heading button.
async function openModule(name: string) {
  await userEvent.click(screen.getByRole("button", { name }));
}

describe("AppShell navigation", () => {
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

  it("shows the settings link for an admin", async () => {
    renderNav("ADMIN", makeFakeFetch(0));
    await openModule("Administração");

    expect(screen.getByRole("link", { name: "Configurações" })).toBeInTheDocument();
  });

  it("shows the alert-rules link for a manager but not for a field worker", async () => {
    renderNav("MANAGER", makeFakeFetch(0));
    await openModule("Planejamento");
    expect(screen.getByRole("link", { name: "Regras de alerta" })).toBeInTheDocument();
  });

  it("shows the reports link for a manager", () => {
    renderNav("MANAGER", makeFakeFetch(0));
    expect(screen.getByRole("link", { name: "Relatórios" })).toBeInTheDocument();
  });

  it("hides the alert-rules link from a field worker", () => {
    renderNav("FIELD_WORKER", makeFakeFetch(0));
    expect(screen.queryByRole("link", { name: "Regras de alerta" })).not.toBeInTheDocument();
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

  it("keeps notifications out of the sidebar and puts the inbox in the header bell", async () => {
    renderNav("MANAGER", makeFakeFetch(0, 3));

    const sidebar = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(within(sidebar).queryByRole("link", { name: /Notificações/ })).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Notificações: 3 não lidas" }),
    ).toBeInTheDocument();
  });

  it("still names the notifications page in the breadcrumb", () => {
    renderNav("MANAGER", makeFakeFetch(0, 0), "/notificacoes");

    const breadcrumb = screen.getByRole("navigation", { name: "Você está em" });
    expect(breadcrumb).toHaveTextContent("Conta");
    expect(within(breadcrumb).getByText("Notificações")).toHaveAttribute("aria-current", "page");
  });

  it("links every registry page for a manager, and the form builder under planning (RF36)", async () => {
    renderNav("MANAGER", makeFakeFetch(0));
    await openModule("Cadastros");
    await openModule("Planejamento");

    for (const name of ["Prédios e pontos", "Profissionais", "Empresas", "Formulários"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    // Service types live inside their company now; planning by hand is gone (§8.1).
    for (const name of ["Tipos de serviço", "Templates de rota", "Reatribuições"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
    // The events feature was removed; its registry entry must not come back.
    expect(screen.queryByRole("link", { name: "Eventos" })).not.toBeInTheDocument();
    // Service points are registered inside their building now, not on a page of their own.
    expect(screen.queryByRole("link", { name: "Pontos de serviço" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Administração" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Usuários" })).not.toBeInTheDocument();
  });

  it("folds secondary modules away until opened", async () => {
    renderNav("MANAGER", makeFakeFetch(0));

    expect(screen.getByRole("link", { name: "Quadro de rotas" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Prédios e pontos" })).not.toBeInTheDocument();

    await openModule("Cadastros");

    expect(screen.getByRole("link", { name: "Prédios e pontos" })).toHaveAttribute(
      "href",
      "/predios",
    );
  });

  it("opens the module of the current page and names it in the breadcrumb", () => {
    // A building opens on the map (?predio=), not on a page of its own.
    renderNav("MANAGER", makeFakeFetch(0), "/predios?predio=b1");

    const breadcrumb = screen.getByRole("navigation", { name: "Você está em" });
    expect(breadcrumb).toHaveTextContent("Cadastros");
    expect(within(breadcrumb).getByText("Prédios e pontos")).toHaveAttribute(
      "aria-current",
      "page",
    );
    const sidebarLink = screen
      .getAllByRole("link", { name: "Prédios e pontos" })
      .find((link) => !breadcrumb.contains(link));
    expect(sidebarLink).toHaveAttribute("aria-current", "page");
  });

  it("links the users page for an admin", async () => {
    renderNav("ADMIN", makeFakeFetch(0));
    await openModule("Administração");

    expect(screen.getByRole("link", { name: "Usuários" })).toHaveAttribute("href", "/usuarios");
  });

  it("shows a field worker only their data page and the logout button", () => {
    renderNav("FIELD_WORKER", makeFakeFetch(0));

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Meus dados"]);
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
  });

  it("logs out: calls /auth/logout and drops the stored session", async () => {
    const fakeFetch = makeFakeFetch(0);
    renderNav("MANAGER", fakeFetch);
    await userEvent.click(screen.getByRole("button", { name: "Sair" }));

    await waitFor(() => {
      expect(localStorage.getItem("route-monitor.session")).toBeNull();
    });
    const urls = fakeFetch.mock.calls.map(([input]) => requestUrl(input));
    expect(urls.some((url) => url.endsWith("/auth/logout"))).toBe(true);
  });

  it("registers /formularios under the MANAGER/ADMIN ProtectedRoute", () => {
    const managerBranch = appRoutes.find((branch) =>
      branch.children?.some((child) => child.path === "/rotas"),
    );

    expect(managerBranch?.children?.map((child) => child.path)).toContain("/formularios");
  });

  it("registers /notificacoes under the MANAGER/ADMIN ProtectedRoute", () => {
    const managerBranch = appRoutes.find((branch) =>
      branch.children?.some((child) => child.path === "/rotas"),
    );

    const branchElement = managerBranch?.element;
    expect(isValidElement(branchElement) && branchElement.type).toBe(ConsentGate);
    const guarded = isValidElement<{ children?: ReactNode }>(branchElement)
      ? branchElement.props.children
      : null;
    expect(isValidElement(guarded) && guarded.type).toBe(ProtectedRoute);
    expect(managerBranch?.children?.map((child) => child.path)).toContain("/notificacoes");
  });
});
