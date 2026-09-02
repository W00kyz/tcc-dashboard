import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ExecutionDetailDrawer } from "@/components/ExecutionDetailDrawer";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const DETAIL = {
  execution_id: "e1",
  field_worker_id: "w1",
  field_worker_name: "João da Silva",
  service_point_id: "sp1",
  service_point_name: "Sala 101",
  building_id: "b1",
  building_name: "Bloco CG",
  floor_label: "Térreo",
  checked_in_at: "2026-08-30T13:05:00Z",
  checked_out_at: "2026-08-30T13:40:00Z",
  geo_validation: "OUT_OF_RADIUS",
  review_status: "RESOLVED",
  validation_flags: ["OUT_OF_RADIUS", "OUTSIDE_SCHEDULE"],
  source: "APP",
  evidence_count: 0,
  route_id: "r1",
  scans: [
    {
      kind: "CHECK_IN",
      geo_validation: "VALIDATED",
      latitude: -7.2,
      longitude: -35.9,
      distance_m: 12.4,
      service_point_id: "sp1",
      scanned_at: "2026-08-30T13:05:00Z",
    },
    {
      kind: "CHECK_OUT",
      geo_validation: "OUT_OF_RADIUS",
      latitude: -7.2,
      longitude: -35.9,
      distance_m: 87.6,
      service_point_id: "sp1",
      scanned_at: "2026-08-30T13:40:00Z",
    },
  ],
  evidence: [],
  manual_completion: {
    completed_by: "Gestor Central",
    reason: "Sistema fora do ar durante a visita",
    completed_at: "2026-08-30T14:00:00Z",
  },
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}

function makeFakeFetch(overrides: Record<string, unknown> = {}) {
  const detail = { ...DETAIL, ...overrides };

  return vi.fn((input: RequestInfo | URL) => {
    const url = requestUrl(input);

    if (url.includes("/review/resolve")) {
      return Promise.resolve(
        new Response(JSON.stringify({ ...detail, review_status: "RESOLVED" }), { status: 200 }),
      );
    }

    return Promise.resolve(new Response(JSON.stringify(detail), { status: 200 }));
  });
}

function renderDrawer(fetchImpl: typeof fetch, onClose: () => void = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", fetchImpl);

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ExecutionDetailDrawer executionId="e1" onClose={onClose} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("ExecutionDetailDrawer", () => {
  it("renders the timeline, both flag badges, scan distances and the manual-completion reason", async () => {
    renderDrawer(makeFakeFetch());

    expect(await screen.findByText(formatDateTime(DETAIL.checked_in_at))).toBeInTheDocument();
    expect(screen.getByText(formatDateTime(DETAIL.checked_out_at))).toBeInTheDocument();

    expect(screen.getByText("Fora do raio")).toBeInTheDocument();
    expect(screen.getByText("Fora da janela")).toBeInTheDocument();

    expect(screen.getByText("12 m")).toBeInTheDocument();
    expect(screen.getByText("88 m")).toBeInTheDocument();

    expect(screen.getByText("Sistema fora do ar durante a visita")).toBeInTheDocument();
  });

  it("shows the resolve-review button only while PENDING_REVIEW and posts on click", async () => {
    const fakeFetch = makeFakeFetch({ review_status: "PENDING_REVIEW" });
    renderDrawer(fakeFetch);

    const button = await screen.findByRole("button", { name: "Marcar revisão como resolvida" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(
        fakeFetch.mock.calls.some(([input]) =>
          requestUrl(input).includes("/executions/e1/review/resolve"),
        ),
      ).toBe(true);
    });
  });

  it("hides the resolve-review button for RESOLVED and NONE", async () => {
    const { unmount } = renderDrawer(makeFakeFetch({ review_status: "RESOLVED" }));
    await screen.findByText("Linha do tempo");
    expect(
      screen.queryByRole("button", { name: "Marcar revisão como resolvida" }),
    ).not.toBeInTheDocument();
    unmount();

    renderDrawer(makeFakeFetch({ review_status: "NONE" }));
    await screen.findByText("Linha do tempo");
    expect(
      screen.queryByRole("button", { name: "Marcar revisão como resolvida" }),
    ).not.toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    renderDrawer(makeFakeFetch(), onClose);
    await screen.findByText("Linha do tempo");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
