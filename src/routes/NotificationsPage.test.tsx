import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { NotificationsPage } from "@/routes/NotificationsPage";

const UNREAD = {
  id: "n1",
  kind: "ALERT",
  title: "Ponto atrasado",
  body: "A rota de João está atrasada.",
  data: { alert_id: "a1" },
  read_at: null,
  created_at: "2026-09-06T12:30:00Z",
};

const READ = {
  id: "n2",
  kind: "APPEAL_FILED",
  title: "Novo recurso",
  body: "Maria contestou a liberação de Sala 202.",
  data: {},
  read_at: "2026-09-06T10:00:00Z",
  created_at: "2026-09-06T09:00:00Z",
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function makeFakeFetch() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);

    if (url.includes("/notifications/me/read-all")) {
      return Promise.resolve(new Response(JSON.stringify({ marked: 1 }), { status: 200 }));
    }
    if (url.includes("/notifications/me/unread-count")) {
      return Promise.resolve(new Response(JSON.stringify({ count: 1 }), { status: 200 }));
    }
    if (/\/notifications\/[^/]+\/read$/.test(url)) {
      return Promise.resolve(new Response(JSON.stringify(UNREAD), { status: 200 }));
    }
    if (url.includes("/notifications/me")) {
      const parsed = new URL(url, "http://localhost");
      const unreadOnly = parsed.searchParams.get("unread_only") === "true";
      const page = Number(parsed.searchParams.get("page") ?? "1");
      const items = unreadOnly ? [UNREAD] : [UNREAD, READ];

      return Promise.resolve(
        new Response(JSON.stringify({ items, total: 40, page, page_size: 20 }), { status: 200 }),
      );
    }

    return Promise.resolve(new Response("{}", { status: 200 }));
  });
}

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);
  localStorage.setItem(
    "route-monitor.session",
    JSON.stringify({ accessToken: "t", refreshToken: "r", role: "MANAGER" }),
  );

  return render(
    <MemoryRouter initialEntries={["/notificacoes"]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NotificationsPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("NotificationsPage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists notifications and marks the unread one as visually distinct", async () => {
    renderPage(makeFakeFetch());

    expect(await screen.findByText("Ponto atrasado")).toBeInTheDocument();
    expect(screen.getByText("Novo recurso")).toBeInTheDocument();
    const unread = screen.getByRole("button", { name: /Ponto atrasado/ });
    const read = screen.getByRole("button", { name: /Novo recurso/ });
    expect(within(unread).getByText("Não lida")).toBeInTheDocument();
    expect(within(read).queryByText("Não lida")).not.toBeInTheDocument();
  });

  it("marks an unread notification read when it is clicked", async () => {
    const fetchImpl = makeFakeFetch();
    const user = userEvent.setup();
    renderPage(fetchImpl);

    await user.click(await screen.findByRole("button", { name: /Ponto atrasado/ }));

    await waitFor(() => {
      expect(
        fetchImpl.mock.calls.some(([input]) =>
          requestUrl(input).includes("/notifications/n1/read"),
        ),
      ).toBe(true);
    });
  });

  it("opens an impediment notification on Justificativas", async () => {
    const impediment = {
      ...UNREAD,
      id: "n3",
      kind: "IMPEDIMENT_REPORTED",
      title: "Impossibilidade sinalizada",
      data: { impediment_id: "i1", route_id: "r1" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ items: [impediment], total: 1, page: 1, page_size: 20 }), {
            status: 200,
          }),
        ),
      ),
    );
    localStorage.setItem(
      "route-monitor.session",
      JSON.stringify({ accessToken: "t", refreshToken: "r", role: "MANAGER" }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/notificacoes"]}>
        <QueryClientProvider client={new QueryClient()}>
          <AuthProvider>
            <Routes>
              <Route path="/notificacoes" element={<NotificationsPage />} />
              <Route path="/rotas" element={<p>quadro de rotas</p>} />
              <Route path="/justificativas" element={<p>justificativas</p>} />
            </Routes>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Impossibilidade")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Impossibilidade sinalizada/ }));

    expect(await screen.findByText("justificativas")).toBeInTheDocument();
  });

  it("opens an appeal notification on Justificativas and labels its kind", async () => {
    const filed = { ...UNREAD, id: "n4", kind: "APPEAL_FILED", data: { appeal_id: "a1" } };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ items: [filed], total: 1, page: 1, page_size: 20 }), {
            status: 200,
          }),
        ),
      ),
    );
    localStorage.setItem(
      "route-monitor.session",
      JSON.stringify({ accessToken: "t", refreshToken: "r", role: "MANAGER" }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/notificacoes"]}>
        <QueryClientProvider client={new QueryClient()}>
          <AuthProvider>
            <Routes>
              <Route path="/notificacoes" element={<NotificationsPage />} />
              <Route path="/justificativas" element={<p>justificativas</p>} />
            </Routes>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Recurso")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ponto atrasado/ }));

    expect(await screen.findByText("justificativas")).toBeInTheDocument();
  });

  it("marks all notifications read", async () => {
    const fetchImpl = makeFakeFetch();
    const user = userEvent.setup();
    renderPage(fetchImpl);

    await user.click(await screen.findByRole("button", { name: "Marcar todas como lidas" }));

    await waitFor(() => {
      expect(
        fetchImpl.mock.calls.some(([input]) =>
          requestUrl(input).includes("/notifications/me/read-all"),
        ),
      ).toBe(true);
    });
  });

  it("disables Marcar todas como lidas when nothing is unread", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/notifications/me/unread-count")) {
        return Promise.resolve(new Response(JSON.stringify({ count: 0 }), { status: 200 }));
      }

      return Promise.resolve(
        new Response(JSON.stringify({ items: [READ], total: 1, page: 1, page_size: 20 }), {
          status: 200,
        }),
      );
    });
    renderPage(fetchImpl);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Marcar todas como lidas" })).toBeDisabled();
    });
  });

  it("shows an error banner when marking all as read fails", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/notifications/me/read-all")) {
        return Promise.resolve(new Response("boom", { status: 500 }));
      }
      if (url.includes("/notifications/me/unread-count")) {
        return Promise.resolve(new Response(JSON.stringify({ count: 1 }), { status: 200 }));
      }
      if (url.includes("/notifications/me")) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [UNREAD], total: 1, page: 1, page_size: 20 }), {
            status: 200,
          }),
        );
      }

      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    const user = userEvent.setup();
    renderPage(fetchImpl);

    await user.click(await screen.findByRole("button", { name: "Marcar todas como lidas" }));

    expect(
      await screen.findByText(
        "Não foi possível marcar as notificações como lidas. Tente novamente.",
      ),
    ).toBeInTheDocument();
  });

  it("re-queries with unread_only when the toggle is checked", async () => {
    const fetchImpl = makeFakeFetch();
    const user = userEvent.setup();
    renderPage(fetchImpl);

    await screen.findByText("Novo recurso");
    await user.click(screen.getByRole("checkbox", { name: "Só não lidas" }));

    await waitFor(() => {
      expect(
        fetchImpl.mock.calls.some(([input]) => requestUrl(input).includes("unread_only=true")),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText("Novo recurso")).not.toBeInTheDocument();
    });
  });

  it("advances the page query param when Próxima is clicked", async () => {
    const fetchImpl = makeFakeFetch();
    const user = userEvent.setup();
    renderPage(fetchImpl);

    await screen.findByText("Ponto atrasado");
    await user.click(screen.getByRole("button", { name: "Próxima" }));

    await waitFor(() => {
      expect(fetchImpl.mock.calls.some(([input]) => requestUrl(input).includes("page=2"))).toBe(
        true,
      );
    });
  });
});
