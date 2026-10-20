import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { NotFoundPage } from "@/routes/NotFoundPage";

describe("NotFoundPage", () => {
  it("says the page does not exist and links back to the start", () => {
    const router = createMemoryRouter([{ path: "*", element: <NotFoundPage /> }], {
      initialEntries: ["/nao-existe"],
    });
    render(<RouterProvider router={router} />);

    expect(screen.getByRole("heading", { name: "Página não encontrada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao início" })).toHaveAttribute("href", "/");
  });
});
