import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { EditPlaceDialog } from "@/components/buildings/EditPlaceDialog";
import { FakeApi } from "@/test/fakeApi";

const PLACE = { id: "pl1", name: "Ponto de ônibus", latitude: -7.2155, longitude: -35.9085 };
const point = (id: string, typeId: string, typeName: string, active = true) => ({
  id,
  floor_id: null,
  place_id: "pl1",
  name: "Ponto de ônibus",
  description: "",
  latitude: PLACE.latitude,
  longitude: PLACE.longitude,
  service_type_id: typeId,
  service_type_name: typeName,
  room_id: null,
  active,
});
const serviceType = (id: string, name: string, company: string) => ({
  id,
  name,
  average_duration_minutes: 30,
  contractor_company_id: `c-${company}`,
  contractor_company_name: company,
});
const TYPES = [
  serviceType("t1", "Jardinagem", "Alfa"),
  serviceType("t2", "Segurança", "Beta"),
  serviceType("t3", "Limpeza", "Alfa"),
];
const IMPACT = {
  points: 2,
  floors: 0,
  rooms: 0,
  routes: 1,
  executions: 4,
  photos: 0,
  appeals: 0,
  places: 1,
};

function baseApi(points = [point("p1", "t1", "Jardinagem")]) {
  return new FakeApi().on("GET", "/service-points", points).on("GET", "/service-types", TYPES);
}

function renderDialog(api: FakeApi) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const props = { onOpenChange: vi.fn(), onMove: vi.fn(), onDeleted: vi.fn() };
  api.install();
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <EditPlaceDialog place={PLACE} open {...props} />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { invalidate, ...props };
}

const dialog = () => screen.getByRole("dialog", { name: "Editar local" });

describe("EditPlaceDialog", () => {
  it("names the place and lists its services, an inactive one included", async () => {
    renderDialog(baseApi([point("p1", "t1", "Jardinagem"), point("p2", "t2", "Segurança", false)]));

    expect(within(dialog()).getByText("Ponto de ônibus")).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "Jardinagem" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Segurança" })).not.toBeChecked();
  });

  it("still renders a place whose only service is inactive", async () => {
    renderDialog(baseApi([point("p1", "t1", "Jardinagem", false)]));

    expect(await screen.findByRole("checkbox", { name: "Jardinagem" })).not.toBeChecked();
    expect(within(dialog()).getByRole("button", { name: "Adicionar serviço" })).toBeVisible();
  });

  it("renames with only the trimmed name and refreshes places and points", async () => {
    const api = baseApi().on("PATCH", "/places/pl1", PLACE);
    const { invalidate } = renderDialog(api);

    const input = screen.getByLabelText("Nome do local");
    await userEvent.clear(input);
    await userEvent.type(input, "  Parada central  ");
    await userEvent.click(screen.getByRole("button", { name: "Renomear local" }));

    await waitFor(() => {
      expect(api.sent("PATCH", "/places/pl1")[0]?.body).toEqual({ name: "Parada central" });
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["places"] });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["service-points"] });
  });

  it("says the name is taken when the rename answers 409", async () => {
    const api = baseApi().on("PATCH", "/places/pl1", { detail: "dup" }, 409);
    renderDialog(api);

    await userEvent.type(screen.getByLabelText("Nome do local"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Renomear local" }));

    expect(await screen.findByText("Já existe um local com esse nome.")).toBeInTheDocument();
  });

  it("adds a service without offering the types the place already has", async () => {
    const api = baseApi().on("POST", "/places/pl1/services", { id: "p9" }, 201);
    const { invalidate } = renderDialog(api);

    await userEvent.click(screen.getByRole("button", { name: "Adicionar serviço" }));
    const select = await screen.findByLabelText("Tipo de serviço");
    await waitFor(() => {
      expect(within(select).getAllByRole("option")).toHaveLength(3);
    });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["", "Segurança", "Limpeza"]);
    await userEvent.selectOptions(select, "t2");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => {
      expect(api.sent("POST", "/places/pl1/services")[0]?.body).toEqual({ service_type_id: "t2" });
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["places"] });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["service-points"] });
  });

  it("says the place already has the service on a PLACE_SERVICE_EXISTS conflict", async () => {
    const conflict = { detail: { code: "PLACE_SERVICE_EXISTS" } };
    const api = baseApi().on("POST", "/places/pl1/services", conflict, 409);
    renderDialog(api);

    await userEvent.click(screen.getByRole("button", { name: "Adicionar serviço" }));
    await userEvent.selectOptions(await screen.findByLabelText("Tipo de serviço"), "t3");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByText("Este local já tem esse serviço.")).toBeInTheDocument();
  });

  it("removes the place only after showing the impact and being confirmed", async () => {
    const api = baseApi()
      .on("GET", "/places/pl1/deletion-impact", IMPACT)
      .on("DELETE", "/places/pl1", new Response(null, { status: 204 }));
    const { invalidate, onDeleted } = renderDialog(api);

    await userEvent.click(screen.getByRole("button", { name: "Remover local Ponto de ônibus" }));
    const confirm = await screen.findByRole("dialog", { name: "Remover Ponto de ônibus?" });

    expect(await within(confirm).findByText("4 execuções")).toBeInTheDocument();
    expect(within(confirm).getByText("2 pontos de serviço")).toBeInTheDocument();
    // The place itself is the thing removed: not an "also removed" line.
    expect(within(confirm).queryByText(/1 local/)).toBeNull();
    expect(api.sent("DELETE", "/places/pl1")).toHaveLength(0);
    await userEvent.click(within(confirm).getByRole("button", { name: "Remover" }));

    await waitFor(() => {
      expect(api.sent("DELETE", "/places/pl1")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["places"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["service-points"] });
  });

  it("sends nothing when the place removal is cancelled", async () => {
    const api = baseApi().on("GET", "/places/pl1/deletion-impact", IMPACT);
    const { onDeleted } = renderDialog(api);

    await userEvent.click(screen.getByRole("button", { name: "Remover local Ponto de ônibus" }));
    const confirm = await screen.findByRole("dialog", { name: "Remover Ponto de ônibus?" });
    await within(confirm).findByText("4 execuções");
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Remover Ponto de ônibus?" })).toBeNull();
    });
    expect(api.sent("DELETE", "/places/pl1")).toHaveLength(0);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("closes and asks the page to move the pin, sending nothing itself", async () => {
    const api = baseApi();
    const { onOpenChange, onMove } = renderDialog(api);

    await userEvent.click(screen.getByRole("button", { name: "Mover pin" }));

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(api.sent("PATCH", "/places/pl1")).toHaveLength(0);
  });
});
