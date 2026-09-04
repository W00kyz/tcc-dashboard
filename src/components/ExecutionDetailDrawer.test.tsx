import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  validation_flags: ["OUTSIDE_SCHEDULE", "QR_SUPERSEDED"],
  source: "APP",
  evidence_count: 0,
  route_id: "r1",
  clock_skew_seconds: null,
  form_version_id: null,
  answers: [],
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
      geo_validation: "NOT_VALIDATED",
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

const PHOTO_EVIDENCE = [
  {
    id: "ph1",
    kind: "PHOTO",
    text_body: null,
    content_type: "image/png",
    byte_size: 10,
    captured_at: "2026-08-30T13:10:00Z",
    created_at: "2026-08-30T13:10:05Z",
    content_url: "/evidence/ph1/content",
  },
  {
    id: "ph2",
    kind: "PHOTO",
    text_body: null,
    content_type: "image/png",
    byte_size: 20,
    captured_at: "2026-08-30T13:11:00Z",
    created_at: "2026-08-30T13:11:05Z",
    content_url: "/evidence/ph2/content",
  },
];

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

    if (url.includes("/evidence/")) {
      return Promise.resolve(new Response(new Blob(["img-bytes"]), { status: 200 }));
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

beforeEach(() => {
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${String(counter++)}`);
  URL.revokeObjectURL = vi.fn();
});

describe("ExecutionDetailDrawer", () => {
  it("renders timeline, geo badge, flag badges, scan distances and the manual-completion reason", async () => {
    renderDrawer(makeFakeFetch());

    expect(await screen.findByText(formatDateTime(DETAIL.checked_in_at))).toBeInTheDocument();
    expect(screen.getByText(formatDateTime(DETAIL.checked_out_at))).toBeInTheDocument();

    // Execution-level geo_validation, translated (spec §7.1).
    expect(screen.getByText("Fora do raio")).toBeInTheDocument();

    expect(screen.getByText("Fora da janela")).toBeInTheDocument();
    expect(screen.getByText("QR substituído")).toBeInTheDocument();

    expect(screen.getByText("12 m")).toBeInTheDocument();
    expect(screen.getByText("88 m")).toBeInTheDocument();

    // Scan geo_validation is translated, not the raw enum.
    expect(screen.getByText("Não validado")).toBeInTheDocument();
    expect(screen.queryByText("NOT_VALIDATED")).not.toBeInTheDocument();

    expect(screen.getByText("Sistema fora do ar durante a visita")).toBeInTheDocument();
  });

  it("shows the clock-skew warning row (rounded) when clock_skew_seconds is set", async () => {
    renderDrawer(makeFakeFetch({ clock_skew_seconds: 480, validation_flags: ["CLOCK_SKEW"] }));

    expect(await screen.findByText("Desvio de relógio: 480 s")).toBeInTheDocument();
    // The CLOCK_SKEW flag renders its pt-BR label, not the raw enum.
    expect(screen.getByText("Desvio de relógio implausível")).toBeInTheDocument();
    expect(screen.queryByText("CLOCK_SKEW")).not.toBeInTheDocument();
  });

  it("omits the clock-skew row when clock_skew_seconds is null", async () => {
    renderDrawer(makeFakeFetch({ clock_skew_seconds: null }));

    await screen.findByText("Linha do tempo");
    expect(screen.queryByText(/Desvio de relógio:/)).not.toBeInTheDocument();
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

  it("renders form answers with prompt-to-value formatting when form_version_id is set", async () => {
    renderDrawer(
      makeFakeFetch({
        form_version_id: "fv1",
        answers: [
          { question_stable_key: "k1", prompt: "Área limpa?", value: true },
          { question_stable_key: "k2", prompt: "Nível", value: ["baixo", "médio"] },
        ],
      }),
    );

    expect(await screen.findByText("Formulário")).toBeInTheDocument();
    expect(screen.getByText("Área limpa?:")).toBeInTheDocument();
    expect(screen.getByText("Sim")).toBeInTheDocument();
    expect(screen.getByText("Nível:")).toBeInTheDocument();
    expect(screen.getByText("baixo, médio")).toBeInTheDocument();
  });

  it("falls back to the removed-question label when an answer's prompt is null", async () => {
    renderDrawer(
      makeFakeFetch({
        form_version_id: "fv1",
        answers: [{ question_stable_key: "k1", prompt: null, value: "resposta" }],
      }),
    );

    expect(await screen.findByText("Formulário")).toBeInTheDocument();
    expect(screen.getByText("(pergunta removida da versão):")).toBeInTheDocument();
    expect(screen.getByText("resposta")).toBeInTheDocument();
  });

  it("omits the form section entirely when form_version_id is null", async () => {
    renderDrawer(makeFakeFetch({ form_version_id: null, answers: [] }));

    await screen.findByText("Linha do tempo");
    expect(screen.queryByText("Formulário")).not.toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    renderDrawer(makeFakeFetch(), onClose);
    await screen.findByText("Linha do tempo");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the lightbox first, leaving the drawer open until a second Escape", async () => {
    const onClose = vi.fn();
    renderDrawer(makeFakeFetch({ evidence: PHOTO_EVIDENCE, review_status: "NONE" }), onClose);

    const [firstThumbnail] = await screen.findAllByRole("img");
    if (firstThumbnail === undefined) {
      throw new Error("expected a photo thumbnail to render");
    }
    fireEvent.click(firstThumbnail);

    expect(screen.getByRole("dialog", { name: "Visualizador de evidência" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Visualizador de evidência" }),
      ).not.toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
