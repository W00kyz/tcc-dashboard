import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { FloorBlock } from "@/components/buildings/FloorBlock";
import { FakeApi } from "@/test/fakeApi";

const FLOOR = { id: "f1", building_id: "b1", label: "Térreo", level: 0 };
const QR = { id: "qr1", floor_id: "f1", public_code: "abc", version: 1, status: "ACTIVE" };
const IMPACT = { points: 2, floors: 1, rooms: 3, routes: 0, executions: 4, photos: 0, appeals: 0 };

function floorsApi() {
  return new FakeApi().on("GET", "/floors", [FLOOR]).install();
}

const ROOMS = [
  { id: "r1", floor_id: "f1", name: "101" },
  { id: "r2", floor_id: "f1", name: "Auditório Hattori" },
];
const POINT = {
  id: "p1",
  floor_id: "f1",
  name: "101",
  description: "",
  latitude: -7.2,
  longitude: -35.9,
  service_type_id: "t1",
  service_type_name: "Limpeza",
  room_id: "r1",
  active: true,
};

function renderBlock(rooms: typeof ROOMS = [], points: (typeof POINT)[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FloorBlock floor={FLOOR} rooms={rooms} points={points} serviceTypes={[]} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("FloorBlock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the floor under its label", async () => {
    floorsApi();

    renderBlock();

    expect(await screen.findByText("Térreo")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Térreo" })).toBeInTheDocument();
  });

  it("removes a floor only after showing what goes with it and being confirmed", async () => {
    const api = floorsApi()
      .on("GET", "/floors/f1/deletion-impact", IMPACT)
      .on("DELETE", "/floors/f1", null, 204);

    renderBlock();
    await userEvent.click(await screen.findByRole("button", { name: "Remover andar Térreo" }));
    const dialog = await screen.findByRole("dialog", { name: "Remover Térreo?" });

    expect(await within(dialog).findByText("3 salas")).toBeInTheDocument();
    expect(within(dialog).getByText("4 execuções")).toBeInTheDocument();
    // The floor itself is not "also removed": its own count is left out of the list.
    expect(within(dialog).queryByText(/andar/)).toBeNull();
    expect(api.sent("DELETE", "/floors/f1")).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Remover" }));

    await waitFor(() => {
      expect(api.sent("DELETE", "/floors/f1")).toHaveLength(1);
    });
  });

  it("sends nothing when the removal is cancelled", async () => {
    const api = floorsApi().on("GET", "/floors/f1/deletion-impact", IMPACT);

    renderBlock();
    await userEvent.click(await screen.findByRole("button", { name: "Remover andar Térreo" }));
    const dialog = await screen.findByRole("dialog", { name: "Remover Térreo?" });
    await within(dialog).findByText("3 salas");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(api.sent("DELETE", "/floors/f1")).toHaveLength(0);
  });

  it("renames a floor", async () => {
    const api = floorsApi().on("PATCH", "/floors/f1", {
      id: "f1",
      building_id: "b1",
      label: "Subsolo",
    });

    renderBlock();
    await screen.findByRole("group", { name: "Térreo" });
    await userEvent.click(screen.getByRole("button", { name: /Editar/ }));
    const input = screen.getByLabelText("Rótulo do andar");
    await userEvent.clear(input);
    await userEvent.type(input, "Subsolo");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(api.sent("PATCH", "/floors/f1")[0]?.body).toEqual({ label: "Subsolo" });
    });
  });

  it("generates a QR code after asking why, then lets it be revoked", async () => {
    const api = floorsApi()
      .on("POST", "/floors/f1/qr-codes", QR, 201)
      .on("POST", "/qr-codes/qr1/revoke", { ...QR, status: "REVOKED" });
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Emissão inicial");

    renderBlock();
    await screen.findByRole("group", { name: "Térreo" });
    const row = screen.getByRole("group", { name: "Térreo" });
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

    renderBlock();
    await screen.findByRole("group", { name: "Térreo" });
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

    renderBlock();
    await screen.findByRole("group", { name: "Térreo" });
    await userEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith("blob:mock-url", "_blank");
    });
  });

  // Finding I3: a floor with no active QR 404s here; the bug was blob-opening the JSON error.
  it("explains a floor without an active QR instead of opening the error body", async () => {
    floorsApi().on("GET", "/floors/f1/qr-codes/active/pdf", { detail: "no QR" }, 404);
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    renderBlock();
    await screen.findByRole("group", { name: "Térreo" });
    await userEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("este andar não tem um QR ativo");
    expect(open).not.toHaveBeenCalled();
  });

  it("says the floor has no rooms yet", async () => {
    floorsApi();

    renderBlock();

    expect(await screen.findByText("Nenhuma sala neste andar.")).toBeInTheDocument();
  });

  it("lists each room with only its own services", async () => {
    floorsApi();
    const other = { ...POINT, id: "p2", service_type_name: "Elétrica", room_id: "r2" };

    renderBlock(ROOMS, [POINT, other]);

    const first = await screen.findByRole("group", { name: "101" });
    expect(within(first).getByRole("checkbox", { name: "Limpeza" })).toBeChecked();
    expect(within(first).queryByRole("checkbox", { name: "Elétrica" })).toBeNull();
    const second = screen.getByRole("group", { name: "Auditório Hattori" });
    expect(within(second).getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.queryByText("Nenhuma sala neste andar.")).toBeNull();
  });

  it("creates a room and warns when it got no cleaning point", async () => {
    const api = floorsApi().on(
      "POST",
      "/rooms",
      { id: "r3", floor_id: "f1", name: "101", cleaning: "NO_CLEANING_TYPE" },
      201,
    );

    renderBlock();
    await userEvent.click(await screen.findByRole("button", { name: "Nova sala" }));
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("cadastre o tipo de serviço");
    expect(api.sent("POST", "/rooms")[0]?.body).toEqual({ floor_id: "f1", with_cleaning: true });
  });
});
