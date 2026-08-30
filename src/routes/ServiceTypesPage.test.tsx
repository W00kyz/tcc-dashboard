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
  });
});
