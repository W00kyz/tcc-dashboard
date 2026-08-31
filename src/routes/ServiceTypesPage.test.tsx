import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ServiceTypesPage } from "@/routes/ServiceTypesPage";

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ServiceTypesPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("ServiceTypesPage", () => {
  it("lists existing service types", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify([{ id: "s1", name: "Limpeza", average_duration_minutes: 30 }]),
          { status: 200 },
        ),
      );

    renderPage(fakeFetch);

    await waitFor(() => {
      expect(screen.getByText("Limpeza")).toBeInTheDocument();
    });
  });

  it("submits the create-service-type form", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "s2", name: "Poda de árvores", average_duration_minutes: 90 }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const { default: userEvent } = await import("@testing-library/user-event");

    renderPage(fakeFetch);
    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    await userEvent.type(screen.getByLabelText("Nome"), "Poda de árvores");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(3);
    });
    // openapi-fetch calls the injected fetch with a single Request object rather than a
    // (url, init) pair, so the submitted body has to be read off that Request's own clone.
    const submitCall = fakeFetch.mock.calls.find(
      ([request]) => (request as Request).method === "POST",
    );
    if (submitCall === undefined) {
      throw new Error("expected a POST request to /service-types among the fake fetch calls");
    }
    const body = (await (submitCall[0] as Request).clone().json()) as Record<string, unknown>;
    // The duration input is never touched by this test, so its default (30) is what's sent —
    // asserting on that, not just the call count, is what actually proves the form field maps
    // to the right request field.
    expect(body).toEqual({ name: "Poda de árvores", average_duration_minutes: 30 });
  });
});
