import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App, appRoutes } from "./App";
import { AuthProvider } from "@/auth/AuthContext";

// The redirect targets are full pages with their own tests; here only where a link lands
// matters, so they render a marker instead of hitting the API.
vi.mock("@/routes/RouteBoardPage", () => ({ RouteBoardPage: () => <p>quadro</p> }));
vi.mock("@/routes/ContractorCompaniesPage", () => ({
  ContractorCompaniesPage: () => <p>empresas</p>,
}));

afterEach(() => {
  localStorage.clear();
});

function renderAt(path: string) {
  localStorage.setItem(
    "route-monitor.session",
    JSON.stringify({ accessToken: "t", refreshToken: "r", role: "MANAGER" }),
  );
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return router;
}

describe("App", () => {
  it("redirects the root path to the login screen", async () => {
    render(<App />);

    expect(await screen.findByText("PU · UFCG")).toBeInTheDocument();
  });

  it.each(["/templates-de-rota", "/reatribuicoes", "/rotas/nova", "/rotas/r1/editar"])(
    "sends the removed planning page %s to the board",
    async (path) => {
      const router = renderAt(path);

      expect(await screen.findByText("quadro")).toBeInTheDocument();
      await waitFor(() => {
        expect(router.state.location.pathname).toBe("/rotas");
      });
      expect(router.state.location.search).toBe("");
    },
  );

  it("sends the removed service types page to the companies, where types live now", async () => {
    const router = renderAt("/tipos-de-servico");

    expect(await screen.findByText("empresas")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/empresas-terceirizadas");
  });
});
