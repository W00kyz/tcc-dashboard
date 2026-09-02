import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { components } from "@/api/generated/schema";
import { AuthProvider } from "@/auth/AuthContext";
import { CompleteManuallyDialog } from "@/components/CompleteManuallyDialog";

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

const ROUTE: RouteOut = {
  id: "r1",
  field_worker_id: "w1",
  field_worker_name: "João da Silva",
  route_date: "2026-08-31",
  route_type: "REGULAR",
  status: "IN_PROGRESS",
  scheduled_start_at: null,
  started_at: null,
  routing_degraded: false,
  stops: [
    makeStop({ id: "s1", order_index: 1, status: "DONE", service_point_name: "Sala 101" }),
    makeStop({ id: "s2", order_index: 2, status: "PENDING", service_point_name: "Sala 202" }),
    makeStop({ id: "s3", order_index: 3, status: "IN_PROGRESS", service_point_name: "Sala 303" }),
  ],
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function makeFakeFetch(status = 201) {
  return vi.fn((input: RequestInfo | URL) => {
    if (requestUrl(input).includes("/complete-manually")) {
      return Promise.resolve(new Response(JSON.stringify(ROUTE), { status }));
    }

    return Promise.resolve(new Response(JSON.stringify(ROUTE), { status: 200 }));
  });
}

function Harness({ route, fetchImpl }: { route: RouteOut; fetchImpl: typeof fetch }) {
  const [open, setOpen] = useState(true);
  vi.stubGlobal("fetch", fetchImpl);

  return (
    <AuthProvider>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        reabrir
      </button>
      <CompleteManuallyDialog route={route} open={open} onOpenChange={setOpen} />
    </AuthProvider>
  );
}

function renderDialog(route: RouteOut, fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <Harness route={route} fetchImpl={fetchImpl} />
      </QueryClientProvider>,
    ),
  };
}

describe("CompleteManuallyDialog", () => {
  it("lists only the non-DONE stops in the select", async () => {
    renderDialog(ROUTE, makeFakeFetch());

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("option", { name: "2. Sala 202" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: "3. Sala 303" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("option", { name: "1. Sala 101" })).not.toBeInTheDocument();
  });

  it("keeps the submit disabled until a reason is typed", async () => {
    const user = userEvent.setup();
    renderDialog(ROUTE, makeFakeFetch());

    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Concluir ponto" });
    expect(submit).toBeDisabled();

    await user.type(
      within(dialog).getByRole("textbox", { name: "Motivo da conclusão" }),
      "Profissional não conseguiu acesso ao prédio",
    );
    expect(submit).toBeEnabled();
  });

  it("POSTs { reason } to the selected stop and invalidates routes and executions", async () => {
    const user = userEvent.setup();
    const fakeFetch = makeFakeFetch();
    const { queryClient } = renderDialog(ROUTE, fakeFetch);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Motivo da conclusão" }),
      "Sem acesso ao prédio",
    );
    await user.click(within(dialog).getByRole("button", { name: "Concluir ponto" }));

    const call = await waitFor(() => {
      const found = fakeFetch.mock.calls.find(([input]) =>
        requestUrl(input).includes("/complete-manually"),
      );
      if (found === undefined) {
        throw new Error("complete-manually request not sent");
      }

      return found;
    });

    expect(requestUrl(call[0]).endsWith("/routes/r1/stops/s2/complete-manually")).toBe(true);
    const body = (await (call[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).toEqual({ reason: "Sem acesso ao prédio" });

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["routes"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["executions"] });
    });
  });

  it("shows an alert on failure and clears it when reopened", async () => {
    const user = userEvent.setup();
    renderDialog(ROUTE, makeFakeFetch(409));

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("textbox", { name: "Motivo da conclusão" }),
      "Sem acesso ao prédio",
    );
    await user.click(within(dialog).getByRole("button", { name: "Concluir ponto" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Não foi possível concluir a ação. Tente novamente.",
    );

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "reabrir" }));
    const reopened = await screen.findByRole("dialog");
    expect(within(reopened).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(reopened).getByRole("textbox", { name: "Motivo da conclusão" })).toHaveValue("");
  });
});
