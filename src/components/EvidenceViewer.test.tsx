import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

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

let revokeObjectUrl: Mock<(url: string) => void>;

beforeEach(() => {
  // A distinct URL per mint so a test can assert exactly which one was (not) revoked.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${String(counter++)}`);
  revokeObjectUrl = vi.fn<(url: string) => void>();
  URL.revokeObjectURL = revokeObjectUrl;
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

  it("keeps each consumer's object URL alive independently while navigating the lightbox", async () => {
    renderViewer();

    const thumbnails = await waitFor(() => {
      const imgs = screen.getAllByRole("img");
      expect(imgs).toHaveLength(2);

      return imgs;
    });
    const [firstThumbnail] = thumbnails;
    if (firstThumbnail === undefined) {
      throw new Error("expected a photo thumbnail to render");
    }
    const firstThumbnailSrc = firstThumbnail.getAttribute("src");

    fireEvent.click(firstThumbnail);
    fireEvent.click(screen.getByRole("button", { name: "Próxima foto" }));
    fireEvent.click(screen.getByRole("button", { name: "Foto anterior" }));

    // The thumbnail never unmounted, so its blob URL must never be revoked out from under it,
    // even though the lightbox minted and revoked its own URL for the same photo.
    expect(firstThumbnailSrc).toMatch(/^blob:/);
    expect(revokeObjectUrl).not.toHaveBeenCalledWith(firstThumbnailSrc);
    expect(screen.getAllByRole("img")[0]?.getAttribute("src")).toBe(firstThumbnailSrc);
  });

  it("shows the photo error message (no stuck spinner) when the content fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    );
    renderViewer();

    // One error message per photo (2), and the loading text is gone — not a stuck spinner.
    await waitFor(() => {
      expect(screen.getAllByText("Não foi possível carregar a foto.")).toHaveLength(2);
    });
    expect(screen.queryByText("Carregando foto…")).not.toBeInTheDocument();

    // The lightbox opened on the errored photo surfaces the same message.
    const [firstThumbnailButton] = screen.getAllByRole("button");
    if (firstThumbnailButton === undefined) {
      throw new Error("expected a photo thumbnail button to render");
    }
    fireEvent.click(firstThumbnailButton);

    const lightbox = screen.getByRole("dialog", { name: "Visualizador de evidência" });
    expect(
      await within(lightbox).findByText("Não foi possível carregar a foto."),
    ).toBeInTheDocument();
  });
});
