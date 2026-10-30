import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { RoomRow } from "@/components/buildings/RoomRow";
import { FakeApi } from "@/test/fakeApi";

const ROOM = { id: "r1", floor_id: "f1", name: "101" };
const CLEANING = {
  id: "p1",
  floor_id: "f1",
  name: "101",
  description: "perto da escada",
  latitude: -7.2,
  longitude: -35.9,
  service_type_id: "t1",
  service_type_name: "Limpeza",
  room_id: "r1",
  active: true,
};
const ELECTRIC = {
  ...CLEANING,
  id: "p2",
  description: "",
  service_type_id: "t2",
  service_type_name: "Elétrica",
  active: false,
};
const IMPACT = { points: 2, floors: 0, rooms: 1, routes: 1, executions: 4, photos: 0, appeals: 0 };

function wrapper(services: (typeof CLEANING)[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RoomRow room={ROOM} services={services} serviceTypes={[]} />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function renderRow(services: (typeof CLEANING)[]) {
  const view = render(wrapper(services));

  return {
    ...view,
    again: (next: (typeof CLEANING)[]) => {
      view.rerender(wrapper(next));
    },
  };
}

describe("RoomRow", () => {
  it("lists every service as a checkbox, an inactive one stays visible and unchecked", () => {
    new FakeApi().install();

    renderRow([CLEANING, ELECTRIC]);

    expect(screen.getByRole("checkbox", { name: "Limpeza" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Elétrica" })).not.toBeChecked();
  });

  it("still renders a room whose only service is inactive", () => {
    new FakeApi().install();

    renderRow([{ ...CLEANING, active: false }]);

    expect(screen.getByText("101")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Limpeza" })).not.toBeChecked();
  });

  it("unchecking a service deactivates it, keeping the point's name and description", async () => {
    const api = new FakeApi().on("PATCH", "/service-points/p1", CLEANING).install();
    const view = renderRow([CLEANING]);

    await userEvent.click(screen.getByRole("checkbox", { name: "Limpeza" }));

    await waitFor(() => {
      expect(api.sent("PATCH", "/service-points/p1")[0]?.body).toEqual({
        name: "101",
        description: "perto da escada",
        active: false,
      });
    });
    view.again([{ ...CLEANING, active: false }]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Limpeza" }));

    await waitFor(() => {
      expect(api.sent("PATCH", "/service-points/p1")[1]?.body).toEqual({
        name: "101",
        description: "perto da escada",
        active: true,
      });
    });
  });

  it("removes a room only after showing what goes with it and being confirmed", async () => {
    const api = new FakeApi()
      .on("GET", "/rooms/r1/deletion-impact", IMPACT)
      .on("DELETE", "/rooms/r1", null, 204)
      .install();

    renderRow([CLEANING]);
    await userEvent.click(screen.getByRole("button", { name: "Remover sala 101" }));
    const dialog = await screen.findByRole("dialog", { name: "Remover 101?" });

    expect(await within(dialog).findByText("4 execuções")).toBeInTheDocument();
    expect(within(dialog).getByText("2 pontos de serviço")).toBeInTheDocument();
    // The room itself is not "also removed": its own count is left out of the list.
    expect(within(dialog).queryByText(/sala/)).toBeNull();
    expect(api.sent("DELETE", "/rooms/r1")).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Remover" }));

    await waitFor(() => {
      expect(api.sent("DELETE", "/rooms/r1")).toHaveLength(1);
    });
  });

  it("sends nothing when the removal is cancelled", async () => {
    const api = new FakeApi().on("GET", "/rooms/r1/deletion-impact", IMPACT).install();

    renderRow([CLEANING]);
    await userEvent.click(screen.getByRole("button", { name: "Remover sala 101" }));
    const dialog = await screen.findByRole("dialog", { name: "Remover 101?" });
    await within(dialog).findByText("4 execuções");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(api.sent("DELETE", "/rooms/r1")).toHaveLength(0);
  });
});
