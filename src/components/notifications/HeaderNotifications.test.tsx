import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { HeaderNotifications } from "@/components/notifications/HeaderNotifications";

const ALERT_NOTIFICATION = {
  id: "n1",
  kind: "ALERT",
  title: "Ponto atrasado",
  body: "Jéssica Lima está atrasada no Bloco H.",
  data: { route_id: "r1" },
  read_at: null,
  created_at: "2026-10-11T13:50:00Z",
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function makeFakeFetch(unreadCount: number) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.includes("/notifications/me/unread-count")) {
      return Promise.resolve(new Response(JSON.stringify({ count: unreadCount }), { status: 200 }));
    }
    if (url.includes("/notifications/me")) {
      const body = { items: [ALERT_NOTIFICATION], total: 1, page: 1, page_size: 6 };

      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }

    return Promise.resolve(new Response("{}", { status: 200 }));
  });
}

function renderBell(fetchImpl: typeof fetch) {
  vi.stubGlobal("fetch", fetchImpl);
  localStorage.setItem(
    "route-monitor.session",
    JSON.stringify({ accessToken: "t", refreshToken: "r", role: "MANAGER" }),
  );

  return render(
    <MemoryRouter initialEntries={["/execucoes"]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuthProvider>
          <Routes>
            <Route path="/execucoes" element={<HeaderNotifications />} />
            <Route path="/rotas" element={<p>quadro de rotas</p>} />
            <Route path="/notificacoes" element={<p>todas as notificações</p>} />
          </Routes>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("HeaderNotifications", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("announces the unread count on the bell", async () => {
    renderBell(makeFakeFetch(3));

    expect(
      await screen.findByRole("button", { name: "Notificações: 3 não lidas" }),
    ).toBeInTheDocument();
  });

  it("names the bell plainly when everything is read", async () => {
    renderBell(makeFakeFetch(0));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Notificações" })).toBeInTheDocument();
    });
  });

  it("lists the latest notifications and opens one: marks it read and follows its link", async () => {
    const fakeFetch = makeFakeFetch(1);
    const user = userEvent.setup();
    renderBell(fakeFetch);

    await user.click(await screen.findByRole("button", { name: "Notificações: 1 não lida" }));
    await user.click(await screen.findByRole("menuitem", { name: /Ponto atrasado/ }));

    expect(await screen.findByText("quadro de rotas")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        fakeFetch.mock.calls.some(([input]) =>
          requestUrl(input).includes("/notifications/n1/read"),
        ),
      ).toBe(true);
    });
  });

  it("leads to the full notifications page", async () => {
    const user = userEvent.setup();
    renderBell(makeFakeFetch(1));

    await user.click(await screen.findByRole("button", { name: "Notificações: 1 não lida" }));
    await user.click(await screen.findByRole("menuitem", { name: "Ver todas as notificações" }));

    expect(await screen.findByText("todas as notificações")).toBeInTheDocument();
  });
});
