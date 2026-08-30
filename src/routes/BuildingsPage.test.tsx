import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { BuildingsPage } from "@/routes/BuildingsPage";

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BuildingsPage />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("BuildingsPage", () => {
  it("lists existing buildings with a link to their floors", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "b1", name: "Bloco CI", campus_area: "CCT" }]), {
        status: 200,
      }),
    );

    renderPage(fakeFetch);

    await waitFor(() => {
      expect(screen.getByText("Bloco CI")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Ver andares" })).toHaveAttribute(
        "href",
        "/predios/b1/andares",
      );
    });
  });

  it("submits the create-building form", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "b2", name: "Bloco CEEI", campus_area: "CCT" }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const { default: userEvent } = await import("@testing-library/user-event");

    renderPage(fakeFetch);
    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    await userEvent.type(screen.getByLabelText("Nome"), "Bloco CEEI");
    await userEvent.type(screen.getByLabelText("Área do campus"), "CCT");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(3);
    });
  });
});
