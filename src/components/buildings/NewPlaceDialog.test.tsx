import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { NewPlaceDialog } from "@/components/buildings/NewPlaceDialog";
import { FakeApi } from "@/test/fakeApi";

const POSITION = { lat: -7.2155, lng: -35.9085 };
const TYPES = [
  {
    id: "t1",
    name: "Limpeza",
    average_duration_minutes: 30,
    contractor_company_id: "c1",
    contractor_company_name: "Alfa",
  },
  {
    id: "t9",
    name: "Sem empresa",
    average_duration_minutes: 30,
    contractor_company_id: null,
    contractor_company_name: null,
  },
];
const CREATED = { id: "pl1", name: "Ponto de ônibus", latitude: -7.2155, longitude: -35.9085 };

function renderDialog(api: FakeApi, onClose = vi.fn(), onCreated = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  api.on("GET", "/service-types", TYPES).install();
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NewPlaceDialog position={POSITION} onClose={onClose} onCreated={onCreated} />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { invalidate, onClose, onCreated };
}

async function fillAndSubmit(name = "  Ponto de ônibus  ") {
  await userEvent.type(screen.getByLabelText("Nome do local"), name);
  await userEvent.selectOptions(await screen.findByLabelText("Serviço"), "t1");
  await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
}

describe("NewPlaceDialog", () => {
  it("shows the position read-only and offers only types with a company, by company", async () => {
    renderDialog(new FakeApi());

    expect(screen.getByRole("dialog", { name: "Novo local" })).toBeInTheDocument();
    expect(screen.getByText(/-7\.2155, -35\.9085/)).toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "Alfa" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Sem empresa" })).toBeNull();
  });

  it("posts exactly name (trimmed), position and service type, then reports the new place", async () => {
    const api = new FakeApi().on("POST", "/places", CREATED, 201);
    const { invalidate, onClose, onCreated } = renderDialog(api);

    await fillAndSubmit();

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith("pl1");
    });
    expect(api.sent("POST", "/places")[0]?.body).toEqual({
      name: "Ponto de ônibus",
      latitude: -7.2155,
      longitude: -35.9085,
      service_type_id: "t1",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["places"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["service-points"] });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not post while the name or the service is missing", async () => {
    const api = new FakeApi();
    renderDialog(api);

    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    expect(api.sent("POST", "/places")).toHaveLength(0);
    expect(screen.getByText(/Preencha/)).toBeInTheDocument();
  });

  it("keeps the dialog open with the duplicate-name message on 409", async () => {
    const api = new FakeApi().on("POST", "/places", { detail: "Place name already exists." }, 409);
    const { onClose, onCreated } = renderDialog(api);

    await fillAndSubmit();

    expect(await screen.findByText("Já existe um local com esse nome.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Novo local" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("explains a pin outside the campus on 422 OUTSIDE_CAMPUS", async () => {
    const api = new FakeApi().on("POST", "/places", { detail: { code: "OUTSIDE_CAMPUS" } }, 422);
    renderDialog(api);

    await fillAndSubmit();

    expect(await screen.findByText("O pin precisa estar dentro do campus.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Novo local" })).toBeInTheDocument();
  });

  it("falls back to the generic message on any other failure", async () => {
    const api = new FakeApi().on("POST", "/places", { detail: "boom" }, 500);
    renderDialog(api);

    await fillAndSubmit();

    expect(
      await screen.findByText("Não foi possível criar o local. Tente novamente."),
    ).toBeInTheDocument();
  });

  it("closes from Cancelar without posting", async () => {
    const api = new FakeApi();
    const { onClose } = renderDialog(api);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalled();
    expect(api.sent("POST", "/places")).toHaveLength(0);
  });
});
