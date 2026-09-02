import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { EvidenceViewer } from "@/components/EvidenceViewer";

const ITEMS = [
  {
    id: "p1",
    kind: "PHOTO",
    text_body: null,
    content_type: "image/png",
    byte_size: 100,
    captured_at: "2026-08-30T13:05:00Z",
    created_at: "2026-08-30T13:05:10Z",
    content_url: "/evidence/p1/content",
  },
  {
    id: "n1",
    kind: "NOTE",
    text_body: "Piso molhado na entrada da sala",
    content_type: null,
    byte_size: null,
    captured_at: "2026-08-30T13:06:00Z",
    created_at: "2026-08-30T13:06:10Z",
    content_url: null,
  },
  {
    id: "p2",
    kind: "PHOTO",
    text_body: null,
    content_type: "image/png",
    byte_size: 200,
    captured_at: "2026-08-30T13:07:00Z",
    created_at: "2026-08-30T13:07:10Z",
    content_url: "/evidence/p2/content",
  },
];

function renderViewer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <EvidenceViewer items={ITEMS} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-photo");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(new Blob(["img-bytes"]), { status: 200 }))),
  );
});

describe("EvidenceViewer", () => {
  it("renders 2 photo thumbnails and the note body", async () => {
    renderViewer();

    expect(screen.getByText("Piso molhado na entrada da sala")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByRole("img")).toHaveLength(2);
    });
  });

  it("opens the lightbox on a thumbnail click and navigates between the two photos", async () => {
    renderViewer();

    const [firstThumbnail] = await screen.findAllByRole("img");
    if (firstThumbnail === undefined) {
      throw new Error("expected a photo thumbnail to render");
    }
    fireEvent.click(firstThumbnail);

    const lightbox = screen.getByRole("dialog", { name: "Visualizador de evidência" });
    const prev = screen.getByRole("button", { name: "Foto anterior" });
    const next = screen.getByRole("button", { name: "Próxima foto" });

    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(next);
    expect(prev).toBeEnabled();
    expect(next).toBeDisabled();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(lightbox).not.toBeInTheDocument();
    });
  });
});
