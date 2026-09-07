import { afterEach, describe, expect, it, vi } from "vitest";

import type { BoardSnapshot } from "@/api/monitoringStream";
import { subscribeToBoard } from "@/api/monitoringStream";

const SNAPSHOT: BoardSnapshot = {
  generated_at: "2026-09-07T12:00:00Z",
  routes: [],
  open_alerts: [],
  worker_positions: [],
};

/** A fake `text/event-stream` response whose body emits `frames` one chunk at a
 * time and then closes — mirrors what `fetch()` hands back for the real stream. */
function fakeStreamResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < frames.length) {
        controller.enqueue(encoder.encode(frames[index]));
        index += 1;

        return;
      }
      controller.close();
    },
  });

  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function stubFetch(response: Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(response)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("subscribeToBoard", () => {
  it("parses an `event: board` frame and passes the snapshot to onBoard", async () => {
    stubFetch(fakeStreamResponse([`event: board\ndata: ${JSON.stringify(SNAPSHOT)}\n\n`]));
    const onBoard = vi.fn();

    await subscribeToBoard({
      url: "https://api.test/monitoring/stream",
      token: "tok",
      onBoard,
      onError: vi.fn(),
      signal: new AbortController().signal,
    });

    expect(onBoard).toHaveBeenCalledWith(SNAPSHOT);
  });

  it("sends the bearer token on the request", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(fakeStreamResponse([`data: ${JSON.stringify(SNAPSHOT)}\n\n`])),
    );
    vi.stubGlobal("fetch", fetchMock);

    await subscribeToBoard({
      url: "https://api.test/monitoring/stream",
      token: "secret-token",
      onBoard: vi.fn(),
      onError: vi.fn(),
      signal: new AbortController().signal,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-token");
  });

  it("ignores a keep-alive comment frame", async () => {
    stubFetch(fakeStreamResponse([": keep-alive\n\n"]));
    const onBoard = vi.fn();

    await subscribeToBoard({
      url: "https://api.test/monitoring/stream",
      token: "tok",
      onBoard,
      onError: vi.fn(),
      signal: new AbortController().signal,
    });

    expect(onBoard).not.toHaveBeenCalled();
  });

  it("drops a malformed frame without throwing", async () => {
    stubFetch(fakeStreamResponse(["event: board\ndata: {not-json\n\n"]));
    const onBoard = vi.fn();
    const onError = vi.fn();

    await subscribeToBoard({
      url: "https://api.test/monitoring/stream",
      token: "tok",
      onBoard,
      onError,
      signal: new AbortController().signal,
    });

    expect(onBoard).not.toHaveBeenCalled();
  });

  it("reports a non-ok response through onError", async () => {
    stubFetch(new Response("nope", { status: 503 }));
    const onError = vi.fn();

    await subscribeToBoard({
      url: "https://api.test/monitoring/stream",
      token: "tok",
      onBoard: vi.fn(),
      onError,
      signal: new AbortController().signal,
    });

    expect(onError).toHaveBeenCalledOnce();
  });

  it("stops the loop on abort without calling onError", async () => {
    const controller = new AbortController();
    stubFetch(fakeStreamResponse([`event: board\ndata: ${JSON.stringify(SNAPSHOT)}\n\n`]));
    const onBoard = vi.fn(() => {
      controller.abort();
    });
    const onError = vi.fn();

    await subscribeToBoard({
      url: "https://api.test/monitoring/stream",
      token: "tok",
      onBoard,
      onError,
      signal: controller.signal,
    });

    expect(onBoard).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});
