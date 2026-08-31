import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ServicePointsPage } from "@/routes/ServicePointsPage";

function renderPage(fetchImpl: typeof fetch) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ServicePointsPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

// noUncheckedIndexedAccess makes every mock.calls[n] possibly undefined — this narrows it
// with a real check instead of a non-null assertion, matching the project's ban on `!`.
function requestAt(fakeFetch: ReturnType<typeof vi.fn>, callIndex: number): Request {
  const call = fakeFetch.mock.calls[callIndex] as [Request] | undefined;
  if (call === undefined) {
    throw new Error(`expected the fake fetch to have a call at index ${String(callIndex)}`);
  }

  return call[0];
}

// Every test hits the three GET queries the page fires on mount, in the order the
// component declares them: service points, floors, events.
function mockListResponses({
  points = [],
  floors = [],
  events = [],
}: {
  points?: unknown[];
  floors?: unknown[];
  events?: unknown[];
}) {
  return vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(points), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(floors), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(events), { status: 200 }));
}

describe("ServicePointsPage", () => {
  it("lists current service points and offers a promote action for occasional ones", async () => {
    const fakeFetch = mockListResponses({
      points: [
        {
          id: "p1",
          floor_id: "f1",
          name: "Sala 101",
          description: "",
          latitude: -7.2,
          longitude: -35.9,
          point_type: "REGULAR",
          event_id: null,
        },
        {
          id: "p2",
          floor_id: "f1",
          name: "Tenda",
          description: "",
          latitude: -7.2,
          longitude: -35.9,
          point_type: "OCCASIONAL",
          event_id: "e1",
        },
      ],
      floors: [{ id: "f1", building_id: "b1", label: "Térreo" }],
      events: [
        { id: "e1", name: "Vestibular", valid_from: "2027-01-01", valid_until: "2027-01-05" },
      ],
    });

    renderPage(fakeFetch);

    await waitFor(() => {
      expect(screen.getByText("Sala 101")).toBeInTheDocument();
      expect(screen.getByText("Tenda")).toBeInTheDocument();
    });

    // Only the OCCASIONAL point ("Tenda") gets a promote button — REGULAR points already
    // satisfy the backend's own guard (Task 6) that 409s on promoting an already-REGULAR point.
    const regularItem = screen.getByText("Sala 101").closest("li");
    const occasionalItem = screen.getByText("Tenda").closest("li");
    if (regularItem === null || occasionalItem === null) {
      throw new Error("expected both points' list items to have an <li> ancestor");
    }
    expect(
      within(regularItem).queryByRole("button", { name: "Promover a regular" }),
    ).not.toBeInTheDocument();
    expect(
      within(occasionalItem).getByRole("button", { name: "Promover a regular" }),
    ).toBeInTheDocument();
  });

  it("only shows the event picker once the point type is set to occasional", async () => {
    const fakeFetch = mockListResponses({
      floors: [{ id: "f1", building_id: "b1", label: "Térreo" }],
      events: [
        { id: "e1", name: "Vestibular", valid_from: "2027-01-01", valid_until: "2027-01-05" },
      ],
    });
    const { default: userEvent } = await import("@testing-library/user-event");

    renderPage(fakeFetch);
    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(3);
    });

    expect(screen.queryByLabelText("Evento")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "OCCASIONAL");

    const eventSelect = await screen.findByLabelText("Evento");
    expect(within(eventSelect).getByText("Vestibular")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "REGULAR");
    expect(screen.queryByLabelText("Evento")).not.toBeInTheDocument();
  });

  it("requests archived points only once 'show archived' is checked", async () => {
    const fakeFetch = mockListResponses({});
    fakeFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: "p3",
            floor_id: "f1",
            name: "Palco Vestibular",
            description: "",
            latitude: -7.2,
            longitude: -35.9,
            point_type: "OCCASIONAL",
            event_id: "e1",
          },
        ]),
        { status: 200 },
      ),
    );
    const { default: userEvent } = await import("@testing-library/user-event");

    renderPage(fakeFetch);
    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(3);
    });
    const firstPointsRequest = requestAt(fakeFetch, 0);
    expect(new URL(firstPointsRequest.url).searchParams.get("include_archived")).toBe("false");

    await userEvent.click(screen.getByLabelText("Mostrar arquivados"));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(4);
    });
    const archivedRequest = requestAt(fakeFetch, 3);
    expect(new URL(archivedRequest.url).searchParams.get("include_archived")).toBe("true");
    await waitFor(() => {
      expect(screen.getByText("Palco Vestibular")).toBeInTheDocument();
    });
  });

  // Finding I4: the design spec calls for a floor filter alongside "show archived" — the
  // backend already supports ?floor_id=, this page just never sent it.
  it("filters by floor once one is selected, and omits the param for 'all floors'", async () => {
    const fakeFetch = mockListResponses({
      floors: [
        { id: "f1", building_id: "b1", label: "Térreo" },
        { id: "f2", building_id: "b1", label: "1º andar" },
      ],
    });
    fakeFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    fakeFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const { default: userEvent } = await import("@testing-library/user-event");

    renderPage(fakeFetch);
    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(3);
    });
    const firstPointsRequest = requestAt(fakeFetch, 0);
    expect(new URL(firstPointsRequest.url).searchParams.has("floor_id")).toBe(false);

    const floorFilter = screen.getByLabelText("Filtrar por andar");
    await waitFor(() => {
      expect(within(floorFilter).getByText("1º andar")).toBeInTheDocument();
    });
    await userEvent.selectOptions(floorFilter, "f2");

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(4);
    });
    const filteredRequest = requestAt(fakeFetch, 3);
    expect(new URL(filteredRequest.url).searchParams.get("floor_id")).toBe("f2");

    await userEvent.selectOptions(screen.getByLabelText("Filtrar por andar"), "");

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(5);
    });
    const allFloorsRequest = requestAt(fakeFetch, 4);
    expect(new URL(allFloorsRequest.url).searchParams.has("floor_id")).toBe(false);
  });

  it("submits the create form and resets every field, including type and event", async () => {
    const fakeFetch = mockListResponses({
      floors: [{ id: "f1", building_id: "b1", label: "Térreo" }],
      events: [
        { id: "e1", name: "Vestibular", valid_from: "2027-01-01", valid_until: "2027-01-05" },
      ],
    });
    fakeFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "p4",
          floor_id: "f1",
          name: "Tenda",
          description: "Tenda de apoio",
          latitude: -7.2,
          longitude: -35.9,
          point_type: "OCCASIONAL",
          event_id: "e1",
        }),
        { status: 201 },
      ),
    );
    fakeFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    const { default: userEvent } = await import("@testing-library/user-event");

    renderPage(fakeFetch);
    const floorSelect = screen.getByLabelText("Andar");
    await waitFor(() => {
      expect(within(floorSelect).getByText("Térreo")).toBeInTheDocument();
    });

    await userEvent.selectOptions(floorSelect, "f1");
    await userEvent.type(screen.getByLabelText("Nome"), "Tenda");
    await userEvent.type(screen.getByLabelText("Descrição"), "Tenda de apoio");
    // userEvent.type on a number input loses a leading "-" mid-keystroke (the browser
    // sanitizes "-" alone to an empty value before the rest of the digits land), so a
    // negative coordinate has to be set in one shot via fireEvent instead.
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "-7.2" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-35.9" } });
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "OCCASIONAL");
    await userEvent.selectOptions(screen.getByLabelText("Evento"), "e1");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(5);
    });
    const submitCall = fakeFetch.mock.calls.find(
      ([request]) => (request as Request).method === "POST",
    );
    if (submitCall === undefined) {
      throw new Error("expected a POST request to /service-points among the fake fetch calls");
    }
    const body = (await (submitCall[0] as Request).clone().json()) as Record<string, unknown>;
    expect(body).toEqual({
      floor_id: "f1",
      name: "Tenda",
      description: "Tenda de apoio",
      latitude: -7.2,
      longitude: -35.9,
      point_type: "OCCASIONAL",
      event_id: "e1",
    });

    // Every field the create-form owns must reset after a successful submit, not just name and
    // description (Task 14's Events page bug pattern) — the conditional event picker only stays
    // visible after reset if pointType did NOT reset, so its absence proves the whole form reset.
    expect(screen.getByLabelText("Andar")).toHaveValue("");
    expect(screen.getByLabelText("Nome")).toHaveValue("");
    expect(screen.getByLabelText("Descrição")).toHaveValue("");
    expect(screen.getByLabelText("Latitude")).toHaveValue(0);
    expect(screen.getByLabelText("Longitude")).toHaveValue(0);
    expect(screen.getByLabelText("Tipo")).toHaveValue("REGULAR");
    expect(screen.queryByLabelText("Evento")).not.toBeInTheDocument();
  });
});
