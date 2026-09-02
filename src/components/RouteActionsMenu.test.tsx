import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { components } from "@/api/generated/schema";
import { AuthProvider } from "@/auth/AuthContext";
import { RouteActionsMenu } from "@/components/RouteActionsMenu";

type RouteOut = components["schemas"]["RouteOut"];
type RouteStopOut = components["schemas"]["RouteStopOut"];

function makeStop(overrides: Partial<RouteStopOut>): RouteStopOut {
  return {
    id: "s1",
    order_index: 1,
    status: "PENDING",
    service_point_id: "sp1",
    service_point_name: "Sala 101",
    floor_label: "Térreo",
    building_name: "Bloco CG",
    latitude: -7.2,
    longitude: -35.9,
    point_type: "REGULAR",
    expected_arrival_from: null,
    expected_arrival_to: null,
    distance_from_prev_m: null,
    duration_from_prev_s: null,
    leg_geometry: null,
    ...overrides,
  };
}

const WORKERS = [
  {
    id: "w1",
    full_name: "João da Silva",
    contractor_company_id: "c1",
    service_type_ids: [],
    user_id: null,
  },
  {
    id: "w2",
    full_name: "Maria Souza",
    contractor_company_id: "c1",
    service_type_ids: [],
    user_id: null,
  },
];

const PLANNED_ROUTE: RouteOut = {
  id: "r1",
  field_worker_id: "w1",
  field_worker_name: "João da Silva",
  route_date: "2026-08-31",
  route_type: "REGULAR",
  status: "PLANNED",
  scheduled_start_at: null,
  started_at: null,
  routing_degraded: false,
  stops: [],
};

const CANCELLED_ROUTE: RouteOut = { ...PLANNED_ROUTE, id: "r2", status: "CANCELLED" };

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

interface FakeFetchOptions {
  optimizeStatus?: number;
}

function makeFakeFetch(options: FakeFetchOptions = {}) {
  const { optimizeStatus = 200 } = options;

  return vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.includes("/field-workers")) {
      return Promise.resolve(new Response(JSON.stringify(WORKERS), { status: 200 }));
    }
    if (url.includes("/optimize")) {
      return Promise.resolve(
        new Response(JSON.stringify(PLANNED_ROUTE), { status: optimizeStatus }),
      );
    }

    // reassign / cancel both just echo the route back on success
    return Promise.resolve(new Response(JSON.stringify(PLANNED_ROUTE), { status: 200 }));
  });
}

function renderMenu(route: RouteOut, fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouteActionsMenu route={route} />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("RouteActionsMenu", () => {
  it("shows the translated notice (no crash) when optimize returns 503", async () => {
    const user = userEvent.setup();
    renderMenu(PLANNED_ROUTE, makeFakeFetch({ optimizeStatus: 503 }));

    await user.click(screen.getByRole("button", { name: "Otimizar" }));

    expect(
      await screen.findByText("A otimização de rotas está indisponível no momento."),
    ).toBeInTheDocument();
  });

  it("keeps the reassign submit disabled until both a worker and a reason are set", async () => {
    const user = userEvent.setup();
    renderMenu(PLANNED_ROUTE, makeFakeFetch());

    await user.click(screen.getByRole("button", { name: "Reatribuir" }));

    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Confirmar reatribuição" });
    expect(submit).toBeDisabled();

    await within(dialog).findByRole("option", { name: "Maria Souza" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Profissional" }), "w2");
    expect(submit).toBeDisabled();

    await user.type(
      within(dialog).getByRole("textbox", { name: "Motivo da reatribuição" }),
      "Troca de turno",
    );
    expect(submit).toBeEnabled();
  });

  it("sends exactly { field_worker_id, reason } (trimmed) in the reassign request body", async () => {
    const user = userEvent.setup();
    const fakeFetch = makeFakeFetch();
    renderMenu(PLANNED_ROUTE, fakeFetch);

    await user.click(screen.getByRole("button", { name: "Reatribuir" }));

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("option", { name: "Maria Souza" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Profissional" }), "w2");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Motivo da reatribuição" }),
      "  Troca de turno  ",
    );
    await user.click(within(dialog).getByRole("button", { name: "Confirmar reatribuição" }));

    const reassignCall = await waitFor(() => {
      const call = fakeFetch.mock.calls.find(([input]) => requestUrl(input).includes("/reassign"));
      if (call === undefined) {
        throw new Error("reassign request not sent");
      }

      return call;
    });
    const body = (await (reassignCall[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).toEqual({ field_worker_id: "w2", reason: "Troca de turno" });
  });

  it("shows a generic alert when the reassign request fails", async () => {
    const user = userEvent.setup();
    const fakeFetch = vi.fn((input: RequestInfo | URL) => {
      if (requestUrl(input).includes("/field-workers")) {
        return Promise.resolve(new Response(JSON.stringify(WORKERS), { status: 200 }));
      }
      if (requestUrl(input).includes("/reassign")) {
        return Promise.resolve(
          new Response(JSON.stringify({ detail: "conflict" }), { status: 409 }),
        );
      }

      return Promise.resolve(new Response(JSON.stringify(PLANNED_ROUTE), { status: 200 }));
    });
    renderMenu(PLANNED_ROUTE, fakeFetch);

    await user.click(screen.getByRole("button", { name: "Reatribuir" }));

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("option", { name: "Maria Souza" });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: "Profissional" }), "w2");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Motivo da reatribuição" }),
      "Troca de turno",
    );
    await user.click(within(dialog).getByRole("button", { name: "Confirmar reatribuição" }));

    expect(
      await within(dialog).findByText("Não foi possível concluir a ação. Tente novamente."),
    ).toBeInTheDocument();
  });

  it("clears the stale error and fields when a failed dialog is reopened", async () => {
    const user = userEvent.setup();
    const fakeFetch = vi.fn((input: RequestInfo | URL) => {
      if (requestUrl(input).includes("/field-workers")) {
        return Promise.resolve(new Response(JSON.stringify(WORKERS), { status: 200 }));
      }
      if (requestUrl(input).includes("/cancel")) {
        return Promise.resolve(
          new Response(JSON.stringify({ detail: "conflict" }), { status: 409 }),
        );
      }

      return Promise.resolve(new Response(JSON.stringify(PLANNED_ROUTE), { status: 200 }));
    });
    renderMenu(PLANNED_ROUTE, fakeFetch);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    const failedDialog = await screen.findByRole("dialog");
    await user.type(
      within(failedDialog).getByRole("textbox", { name: "Motivo do cancelamento" }),
      "Rota duplicada",
    );
    await user.click(within(failedDialog).getByRole("button", { name: "Confirmar cancelamento" }));
    await within(failedDialog).findByText("Não foi possível concluir a ação. Tente novamente.");

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    const reopened = await screen.findByRole("dialog");
    expect(
      within(reopened).queryByText("Não foi possível concluir a ação. Tente novamente."),
    ).not.toBeInTheDocument();
    expect(within(reopened).getByRole("textbox", { name: "Motivo do cancelamento" })).toHaveValue(
      "",
    );
  });

  it("shows a generic alert when the cancel request fails", async () => {
    const user = userEvent.setup();
    const fakeFetch = vi.fn((input: RequestInfo | URL) => {
      if (requestUrl(input).includes("/field-workers")) {
        return Promise.resolve(new Response(JSON.stringify(WORKERS), { status: 200 }));
      }
      if (requestUrl(input).includes("/cancel")) {
        return Promise.resolve(
          new Response(JSON.stringify({ detail: "conflict" }), { status: 409 }),
        );
      }

      return Promise.resolve(new Response(JSON.stringify(PLANNED_ROUTE), { status: 200 }));
    });
    renderMenu(PLANNED_ROUTE, fakeFetch);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Motivo do cancelamento" }),
      "Rota duplicada",
    );
    await user.click(within(dialog).getByRole("button", { name: "Confirmar cancelamento" }));

    expect(
      await within(dialog).findByText("Não foi possível concluir a ação. Tente novamente."),
    ).toBeInTheDocument();
  });

  it("sends only { reason } in the cancel request body", async () => {
    const user = userEvent.setup();
    const fakeFetch = makeFakeFetch();
    renderMenu(PLANNED_ROUTE, fakeFetch);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Motivo do cancelamento" }),
      "Rota duplicada",
    );
    await user.click(within(dialog).getByRole("button", { name: "Confirmar cancelamento" }));

    const cancelCall = await waitFor(() => {
      const call = fakeFetch.mock.calls.find(([input]) => requestUrl(input).includes("/cancel"));
      if (call === undefined) {
        throw new Error("cancel request not sent");
      }

      return call;
    });
    const body = (await (cancelCall[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).toEqual({ reason: "Rota duplicada" });
  });

  it("offers 'Concluir ponto sem evidência' when a stop is PENDING or IN_PROGRESS", () => {
    const pendingRoute: RouteOut = {
      ...PLANNED_ROUTE,
      stops: [makeStop({ id: "s1", status: "PENDING" })],
    };
    const { unmount } = renderMenu(pendingRoute, makeFakeFetch());
    expect(
      screen.getByRole("button", { name: "Concluir ponto sem evidência" }),
    ).toBeInTheDocument();
    unmount();

    const inProgressRoute: RouteOut = {
      ...PLANNED_ROUTE,
      stops: [makeStop({ id: "s1", status: "IN_PROGRESS" })],
    };
    renderMenu(inProgressRoute, makeFakeFetch());
    expect(
      screen.getByRole("button", { name: "Concluir ponto sem evidência" }),
    ).toBeInTheDocument();
  });

  it("hides 'Concluir ponto sem evidência' when every stop is DONE", () => {
    const doneRoute: RouteOut = {
      ...PLANNED_ROUTE,
      stops: [makeStop({ id: "s1", status: "DONE" })],
    };
    renderMenu(doneRoute, makeFakeFetch());
    expect(
      screen.queryByRole("button", { name: "Concluir ponto sem evidência" }),
    ).not.toBeInTheDocument();
  });

  it("hides 'Concluir ponto sem evidência' for a DONE route even with a non-DONE stop", () => {
    const doneRouteWithStop: RouteOut = {
      ...PLANNED_ROUTE,
      id: "r4",
      status: "DONE",
      stops: [makeStop({ id: "s1", status: "PENDING" })],
    };
    renderMenu(doneRouteWithStop, makeFakeFetch());
    expect(
      screen.queryByRole("button", { name: "Concluir ponto sem evidência" }),
    ).not.toBeInTheDocument();
  });

  it("hides 'Concluir ponto sem evidência' for a CANCELLED route even with a PENDING stop", () => {
    const cancelledWithStop: RouteOut = {
      ...PLANNED_ROUTE,
      id: "r3",
      status: "CANCELLED",
      stops: [makeStop({ id: "s1", status: "PENDING" })],
    };
    renderMenu(cancelledWithStop, makeFakeFetch());
    expect(
      screen.queryByRole("button", { name: "Concluir ponto sem evidência" }),
    ).not.toBeInTheDocument();
  });

  it("disables every action for a route that is CANCELLED", () => {
    renderMenu(CANCELLED_ROUTE, makeFakeFetch());

    const actions = screen.getByTestId("route-actions");
    for (const name of ["Editar", "Otimizar", "Reatribuir", "Cancelar"]) {
      expect(within(actions).getByRole("button", { name })).toBeDisabled();
    }
  });
});
