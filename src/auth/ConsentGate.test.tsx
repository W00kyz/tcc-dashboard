import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ConsentGate } from "@/auth/ConsentGate";

const NOTICE = {
  version: 2,
  title: "Aviso de Privacidade PU/UFCG",
  body_markdown: "Tratamos seus dados pessoais para operar o monitoramento de rotas.",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Routes the two consent endpoints off the request URL; every other call fails loudly so
 * a stray fetch can't pass silently. `/auth/consent-status` is matched before `/auth/consent`
 * because the former contains the latter as a substring. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

function mockConsentApi() {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    void init;
    const url = requestUrl(input);
    if (url.includes("/auth/consent-status")) {
      return Promise.resolve(jsonResponse({ consent_required: true, notice: NOTICE }));
    }
    if (url.includes("/auth/consent")) {
      return Promise.resolve(jsonResponse({ consent_required: false }));
    }

    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  globalThis.fetch = fetchMock;

  return fetchMock;
}

function storeSession(consentRequired: boolean) {
  localStorage.setItem(
    "route-monitor.session",
    JSON.stringify({
      accessToken: "a-token",
      refreshToken: "a-refresh-token",
      role: "MANAGER",
      consentRequired,
    }),
  );
}

function renderGate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <ConsentGate>
            <div>conteúdo protegido</div>
          </ConsentGate>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (input instanceof Request) {
    return input.method;
  }

  return init?.method ?? "GET";
}

function postCalls(fetchMock: ReturnType<typeof mockConsentApi>): unknown[] {
  return fetchMock.mock.calls.filter(([input, init]) => requestMethod(input, init) === "POST");
}

describe("ConsentGate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows the notice and holds back children until the user accepts", async () => {
    const fetchMock = mockConsentApi();
    storeSession(true);
    const user = userEvent.setup();
    renderGate();

    expect(await screen.findByText(NOTICE.title)).toBeInTheDocument();
    expect(screen.getByText(NOTICE.body_markdown)).toBeInTheDocument();
    expect(screen.queryByText("conteúdo protegido")).not.toBeInTheDocument();
    expect(postCalls(fetchMock)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Li e concordo" }));

    await waitFor(() => {
      expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
    });
    expect(postCalls(fetchMock)).toHaveLength(1);
  });

  it("renders children immediately and never fetches when consent is settled", () => {
    const fetchMock = mockConsentApi();
    storeSession(false);
    renderGate();

    expect(screen.getByText("conteúdo protegido")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
