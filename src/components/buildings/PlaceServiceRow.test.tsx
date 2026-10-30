import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { PlaceServiceRow } from "@/components/buildings/PlaceServiceRow";
import { FakeApi } from "@/test/fakeApi";

const GARDENING = {
  id: "p1",
  floor_id: null,
  place_id: "pl1",
  name: "Ponto de ônibus",
  description: "perto do portão",
  latitude: -7.2,
  longitude: -35.9,
  service_type_id: "t1",
  service_type_name: "Jardinagem",
  room_id: null,
  active: true,
};
const IMPACT = { points: 1, floors: 0, rooms: 0, routes: 1, executions: 4, photos: 0, appeals: 0 };

function wrapper(point: typeof GARDENING) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PlaceServiceRow point={point} />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function renderRow(point: typeof GARDENING) {
  const view = render(wrapper(point));

  return {
    again: (next: typeof GARDENING) => {
      view.rerender(wrapper(next));
    },
  };
}

describe("PlaceServiceRow", () => {
  it("shows the service as a checkbox that follows active", () => {
    new FakeApi().install();

    renderRow(GARDENING);

    expect(screen.getByRole("checkbox", { name: "Jardinagem" })).toBeChecked();
  });

  it("keeps an inactive service visible and unchecked", () => {
    new FakeApi().install();

    renderRow({ ...GARDENING, active: false });

    expect(screen.getByRole("checkbox", { name: "Jardinagem" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Remover serviço Jardinagem" })).toBeVisible();
  });

  it("toggling sends only the active flag, never the name or the description", async () => {
    const api = new FakeApi().on("PATCH", "/service-points/p1", GARDENING).install();
    const view = renderRow(GARDENING);

    await userEvent.click(screen.getByRole("checkbox", { name: "Jardinagem" }));
    await waitFor(() => {
      expect(api.sent("PATCH", "/service-points/p1")[0]?.body).toEqual({ active: false });
    });
    view.again({ ...GARDENING, active: false });
    await userEvent.click(screen.getByRole("checkbox", { name: "Jardinagem" }));

    await waitFor(() => {
      expect(api.sent("PATCH", "/service-points/p1")[1]?.body).toEqual({ active: true });
    });
  });

  it("shows the save error when the toggle is refused", async () => {
    new FakeApi().on("PATCH", "/service-points/p1", { detail: "x" }, 500).install();

    renderRow(GARDENING);
    await userEvent.click(screen.getByRole("checkbox", { name: "Jardinagem" }));

    expect(
      await screen.findByText("Não foi possível salvar o local. Tente novamente."),
    ).toBeInTheDocument();
  });

  it("removes the service only after showing what goes with it and being confirmed", async () => {
    const api = new FakeApi()
      .on("GET", "/service-points/p1/deletion-impact", IMPACT)
      .on("DELETE", "/service-points/p1", new Response(null, { status: 204 }))
      .install();

    renderRow(GARDENING);
    await userEvent.click(screen.getByRole("button", { name: "Remover serviço Jardinagem" }));
    const dialog = await screen.findByRole("dialog", { name: "Remover Jardinagem?" });

    expect(await within(dialog).findByText("4 execuções")).toBeInTheDocument();
    // The point itself is the thing removed: it is not listed as "also removed".
    expect(within(dialog).queryByText(/ponto de serviço/)).toBeNull();
    expect(api.sent("DELETE", "/service-points/p1")).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Remover" }));

    await waitFor(() => {
      expect(api.sent("DELETE", "/service-points/p1")).toHaveLength(1);
    });
  });

  it("sends nothing when the removal is cancelled", async () => {
    const api = new FakeApi().on("GET", "/service-points/p1/deletion-impact", IMPACT).install();

    renderRow(GARDENING);
    await userEvent.click(screen.getByRole("button", { name: "Remover serviço Jardinagem" }));
    const dialog = await screen.findByRole("dialog", { name: "Remover Jardinagem?" });
    await within(dialog).findByText("4 execuções");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(api.sent("DELETE", "/service-points/p1")).toHaveLength(0);
  });
});
