import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { FloorsPage } from "@/routes/FloorsPage";

function renderPage(responses: Response[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fakeFetch = vi.fn();
  responses.forEach((response) => {
    fakeFetch.mockResolvedValueOnce(response);
  });
  vi.stubGlobal("fetch", fakeFetch);

  return {
    fakeFetch,
    ...render(
      <MemoryRouter initialEntries={["/predios/b1/andares"]}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Routes>
              <Route path="/predios/:buildingId/andares" element={<FloorsPage />} />
            </Routes>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    ),
  };
}

function floorResponse() {
  return new Response(JSON.stringify([{ id: "f1", building_id: "b1", label: "Térreo" }]), {
    status: 200,
  });
}

describe("FloorsPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists floors for the building in the URL", async () => {
    renderPage([floorResponse()]);

    await waitFor(() => {
      expect(screen.getByText("Térreo")).toBeInTheDocument();
    });
  });

  it("submits the create-floor form scoped to the building in the URL", async () => {
    const { fakeFetch } = renderPage([
      new Response(JSON.stringify([]), { status: 200 }),
      new Response(JSON.stringify({ id: "f2", building_id: "b1", label: "1º andar" }), {
        status: 201,
      }),
      new Response(JSON.stringify([]), { status: 200 }),
    ]);
    const { default: userEvent } = await import("@testing-library/user-event");

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    await userEvent.type(screen.getByLabelText("Rótulo do andar"), "1º andar");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(3);
    });
    const submitCall = fakeFetch.mock.calls.find(
      ([request]) => (request as Request).method === "POST",
    );
    if (submitCall === undefined) {
      throw new Error("expected a POST request to /floors among the fake fetch calls");
    }
    const body = (await (submitCall[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).toEqual({ building_id: "b1", label: "1º andar" });
  });

  it("generates a QR code for a floor after prompting for a reason", async () => {
    const { fakeFetch } = renderPage([
      floorResponse(),
      new Response(
        JSON.stringify({
          id: "qr1",
          floor_id: "f1",
          public_code: "abc",
          version: 1,
          status: "ACTIVE",
        }),
        { status: 201 },
      ),
    ]);
    vi.spyOn(window, "prompt").mockReturnValue("Emissão inicial");
    const { default: userEvent } = await import("@testing-library/user-event");

    await screen.findByText("Térreo");
    await userEvent.click(screen.getByRole("button", { name: "Gerar QR" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    });
    const issueCall = fakeFetch.mock.calls.find(
      ([request]) => (request as Request).method === "POST",
    );
    if (issueCall === undefined) {
      throw new Error("expected a POST request to /floors/f1/qr-codes among the fake fetch calls");
    }
    expect((issueCall[0] as Request).url).toContain("/floors/f1/qr-codes");
    const body = (await (issueCall[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).toEqual({ reason: "Emissão inicial" });
  });

  it("does not call the API when the generate-QR reason prompt is cancelled", async () => {
    const { fakeFetch } = renderPage([floorResponse()]);
    vi.spyOn(window, "prompt").mockReturnValue(null);
    const { default: userEvent } = await import("@testing-library/user-event");

    await screen.findByText("Térreo");
    await userEvent.click(screen.getByRole("button", { name: "Gerar QR" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });
  });

  it("revokes the active QR code once one has been generated in this session", async () => {
    const { fakeFetch } = renderPage([
      floorResponse(),
      new Response(
        JSON.stringify({
          id: "qr1",
          floor_id: "f1",
          public_code: "abc",
          version: 1,
          status: "ACTIVE",
        }),
        { status: 201 },
      ),
      new Response(
        JSON.stringify({
          id: "qr1",
          floor_id: "f1",
          public_code: "abc",
          version: 1,
          status: "REVOKED",
        }),
        { status: 200 },
      ),
    ]);
    const promptSpy = vi.spyOn(window, "prompt");
    const { default: userEvent } = await import("@testing-library/user-event");

    await screen.findByText("Térreo");
    const row = screen.getByText("Térreo").closest("li");
    if (row === null) {
      throw new Error("expected the floor's list item to have a <li> ancestor");
    }

    expect(within(row).getByRole("button", { name: "Revogar QR" })).toBeDisabled();

    promptSpy.mockReturnValue("Emissão inicial");
    await userEvent.click(within(row).getByRole("button", { name: "Gerar QR" }));
    await waitFor(() => {
      expect(within(row).getByRole("button", { name: "Revogar QR" })).toBeEnabled();
    });

    promptSpy.mockReturnValue("QR extraviado");
    await userEvent.click(within(row).getByRole("button", { name: "Revogar QR" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(3);
    });
    const revokeCall = fakeFetch.mock.calls[2];
    if (revokeCall === undefined) {
      throw new Error("expected a third fetch call for the revoke request");
    }
    const revokeRequest = revokeCall[0] as Request;
    expect(revokeRequest.method).toBe("POST");
    expect(revokeRequest.url).toContain("/qr-codes/qr1/revoke");
    const body = (await revokeRequest.clone().json()) as Record<string, unknown>;
    expect(body).toEqual({ reason: "QR extraviado" });
    await waitFor(() => {
      expect(within(row).getByRole("button", { name: "Revogar QR" })).toBeDisabled();
    });
  });

  it("downloads the active QR code PDF as a blob and opens it in a new tab", async () => {
    const pdfBlob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const { fakeFetch } = renderPage([floorResponse(), new Response(pdfBlob, { status: 200 })]);
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const { default: userEvent } = await import("@testing-library/user-event");

    await screen.findByText("Térreo");
    await userEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    });
    // downloadPdf goes through authAwareFetch, which hands fetch a Request carrying the
    // newest access token once a session is signed in.
    const pdfCall = fakeFetch.mock.calls[1];
    if (pdfCall === undefined) {
      throw new Error("expected a second fetch call for the PDF download request");
    }
    const pdfTarget = pdfCall[0] as Request | string;
    const pdfUrl = typeof pdfTarget === "string" ? pdfTarget : pdfTarget.url;
    expect(pdfUrl).toContain("/floors/f1/qr-codes/active/pdf");
    expect(createObjectUrlSpy).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith("blob:mock-url", "_blank");
  });

  // Finding I3: a floor with no active QR (every new floor, every floor right after a
  // revoke) 404s here — the bug was blob-opening that JSON error body as if it were the
  // PDF. This proves the fix shows a message instead of ever calling window.open.
  it("shows an error message instead of opening a tab when the PDF download 404s", async () => {
    const { fakeFetch } = renderPage([
      floorResponse(),
      new Response(JSON.stringify({ detail: 'Floor "f1" has no active QR code.' }), {
        status: 404,
      }),
    ]);
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const { default: userEvent } = await import("@testing-library/user-event");

    await screen.findByText("Térreo");
    await userEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    });
    await screen.findByRole("alert");
    expect(
      screen.getByText("Não foi possível baixar o PDF — este andar não tem um QR ativo."),
    ).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();
  });
});
