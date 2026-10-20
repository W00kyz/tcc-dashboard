import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { BuildingFloorsSection } from "@/components/buildings/BuildingFloorsSection";
import { FakeApi } from "@/test/fakeApi";
import { listItemWithText } from "@/test/queries";

const QR = { id: "qr1", floor_id: "f1", public_code: "abc", version: 1, status: "ACTIVE" };

function floorsApi() {
  return new FakeApi()
    .on("GET", "/floors", [{ id: "f1", building_id: "b1", label: "Térreo" }])
    .install();
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BuildingFloorsSection buildingId="b1" />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("BuildingFloorsSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists the floors of its own building", async () => {
    const api = floorsApi();

    renderSection();

    expect(await screen.findByText("Térreo")).toBeInTheDocument();
    expect(api.sent("GET", "/floors")[0]?.query.get("building_id")).toBe("b1");
  });

  it("creates a floor in this building", async () => {
    const api = floorsApi().on(
      "POST",
      "/floors",
      { id: "f2", building_id: "b1", label: "1º" },
      201,
    );

    renderSection();
    await userEvent.click(screen.getByRole("button", { name: "Novo andar" }));
    await userEvent.type(screen.getByLabelText("Rótulo do andar"), "1º andar");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/floors")[0]?.body).toEqual({
        building_id: "b1",
        label: "1º andar",
      });
    });
  });

  it("generates a QR code after asking why, then lets it be revoked", async () => {
    const api = floorsApi()
      .on("POST", "/floors/f1/qr-codes", QR, 201)
      .on("POST", "/qr-codes/qr1/revoke", { ...QR, status: "REVOKED" });
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Emissão inicial");

    renderSection();
    await screen.findByText("Térreo");
    const row = listItemWithText("Térreo");
    expect(within(row).getByRole("button", { name: "Revogar QR" })).toBeDisabled();
    await userEvent.click(within(row).getByRole("button", { name: "Gerar QR" }));

    expect(await screen.findByRole("status")).toHaveTextContent("QR Code gerado (versão 1)");
    expect(api.sent("POST", "/floors/f1/qr-codes")[0]?.body).toEqual({ reason: "Emissão inicial" });
    prompt.mockReturnValue("QR extraviado");
    await userEvent.click(within(row).getByRole("button", { name: "Revogar QR" }));
    await waitFor(() => {
      expect(api.sent("POST", "/qr-codes/qr1/revoke")[0]?.body).toEqual({
        reason: "QR extraviado",
      });
    });
    await waitFor(() => {
      expect(within(row).getByRole("button", { name: "Revogar QR" })).toBeDisabled();
    });
  });

  it("does not call the API when the reason prompt is cancelled", async () => {
    const api = floorsApi();
    vi.spyOn(window, "prompt").mockReturnValue(null);

    renderSection();
    await screen.findByText("Térreo");
    await userEvent.click(screen.getByRole("button", { name: "Gerar QR" }));

    expect(api.sent("POST", "/floors/f1/qr-codes")).toHaveLength(0);
  });

  it("opens the active QR code PDF in a new tab", async () => {
    floorsApi().onRequest(
      "GET",
      "/floors/f1/qr-codes/active/pdf",
      () => new Response(new Blob(["%PDF-1.4"], { type: "application/pdf" }), { status: 200 }),
    );
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");

    renderSection();
    await screen.findByText("Térreo");
    await userEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith("blob:mock-url", "_blank");
    });
  });

  // Finding I3: a floor with no active QR 404s here; the bug was blob-opening the JSON error.
  it("explains a floor without an active QR instead of opening the error body", async () => {
    floorsApi().on("GET", "/floors/f1/qr-codes/active/pdf", { detail: "no QR" }, 404);
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    renderSection();
    await screen.findByText("Térreo");
    await userEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("este andar não tem um QR ativo");
    expect(open).not.toHaveBeenCalled();
  });
});
