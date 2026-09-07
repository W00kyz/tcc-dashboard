import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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
  kind: "ROUTE_ASSIGNED",
  title: "Nova rota",
  body: "Você recebeu uma rota.",
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
    expect(screen.getByText("Nova rota")).toBeInTheDocument();
    expect(screen.getByTestId("notification-n1")).toHaveAttribute("data-unread", "true");
    expect(screen.getByTestId("notification-n2")).toHaveAttribute("data-unread", "false");
  });

  it("marks an unread notification read when it is clicked", async () => {
    const fetchImpl = makeFakeFetch();
    const user = userEvent.setup();
    renderPage(fetchImpl);

    await user.click(await screen.findByTestId("notification-n1"));

    await waitFor(() => {
      expect(
        fetchImpl.mock.calls.some(([input]) =>
          requestUrl(input).includes("/notifications/n1/read"),
        ),
      ).toBe(true);
    });
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

  it("shows an error banner when marking all as read fails", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/notifications/me/read-all")) {
        return Promise.resolve(new Response("boom", { status: 500 }));
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

    await screen.findByText("Nova rota");
    await user.click(screen.getByRole("checkbox", { name: "Só não lidas" }));

    await waitFor(() => {
      expect(
        fetchImpl.mock.calls.some(([input]) => requestUrl(input).includes("unread_only=true")),
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText("Nova rota")).not.toBeInTheDocument();
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
