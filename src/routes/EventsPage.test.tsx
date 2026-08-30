import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { EventsPage } from "@/routes/EventsPage";

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <EventsPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("EventsPage", () => {
  it("lists existing events with their validity window", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "e1",
            name: "Vestibular 2027",
            valid_from: "2027-01-10",
            valid_until: "2027-01-15",
          },
        ]),
        { status: 200 },
      ),
    );

    renderPage(fakeFetch);

    await waitFor(() => {
      expect(screen.getByText(/Vestibular 2027/)).toBeInTheDocument();
    });
  });

  it("submits the create-event form", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "e2",
            name: "Colação de Grau",
            valid_from: "2027-06-01",
            valid_until: "2027-06-02",
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const { default: userEvent } = await import("@testing-library/user-event");

    renderPage(fakeFetch);
    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    await userEvent.type(screen.getByLabelText("Nome do evento"), "Colação de Grau");
    await userEvent.type(screen.getByLabelText("Início da janela"), "2027-06-01");
    await userEvent.type(screen.getByLabelText("Fim da janela"), "2027-06-02");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(3);
    });

    const createCall = fakeFetch.mock.calls.find(
      ([request]) => (request as Request).method === "POST",
    );
    if (createCall === undefined) {
      throw new Error("expected a POST request to /events among the fake fetch calls");
    }
    const requestBody = (await (createCall[0] as Request).clone().json()) as Record<
      string,
      unknown
    >;
    expect(requestBody).toEqual({
      name: "Colação de Grau",
      valid_from: "2027-06-01",
      valid_until: "2027-06-02",
    });
  });
});
