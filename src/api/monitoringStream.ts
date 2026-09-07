/** SSE client for `GET /monitoring/stream` (spec §2 Ruling 4).
 *
 * `EventSource` cannot send an `Authorization` header, and the board stream is a
 * MANAGER/ADMIN endpoint behind a bearer token — so the transport is a plain
 * `fetch()` whose response body is read as a stream and split into SSE frames by
 * hand. The plan's Global Constraints fix this decision.
 *
 * @example
 * const controller = new AbortController();
 * void subscribeToBoard({
 *   url: `${apiBaseUrl}/monitoring/stream`,
 *   token: session.accessToken,
 *   onBoard: (snapshot) => setSnapshot(snapshot),
 *   onError: (err) => scheduleReconnect(err),
 *   signal: controller.signal,
 * });
 */
import { useEffect, useState } from "react";

import type { components } from "@/api/generated/schema";

export type BoardSnapshot = components["schemas"]["BoardSnapshot"];

interface SubscribeToBoardArgs {
  url: string;
  token: string;
  onBoard: (snapshot: BoardSnapshot) => void;
  onError: (error: unknown) => void;
  signal: AbortSignal;
}

/** After this many consecutive stream failures the caller drops to polling. */
export const MAX_STREAM_FAILURES = 3;
/** Reconnect backoff is `min(2 ** failures, MAX_BACKOFF_SECONDS)` seconds. */
export const MAX_BACKOFF_SECONDS = 30;

/** Parse one `\n\n`-delimited SSE frame and, when it carries a `data:` payload,
 * hand the decoded snapshot to `onBoard`. Comment frames (`: keep-alive`) and
 * bare `event:` lines carry no payload and are ignored; a payload that is not
 * valid JSON is dropped so one bad frame never tears down the stream. */
function handleFrame(frame: string, onBoard: (snapshot: BoardSnapshot) => void): void {
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line === "" || line.startsWith(":") || line.startsWith("event:")) {
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) {
    return;
  }
  try {
    onBoard(JSON.parse(dataLines.join("\n")) as BoardSnapshot);
  } catch {
    // A malformed frame is not fatal — the next frame carries a fresh full snapshot.
  }
}

/** Open the board stream and invoke `onBoard` for every snapshot frame until the
 * stream ends or `signal` aborts. A read error or a closed connection is reported
 * once through `onError`; an abort is silent (the caller asked to stop). */
export async function subscribeToBoard({
  url,
  token,
  onBoard,
  onError,
  signal,
}: SubscribeToBoardArgs): Promise<void> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
      signal,
    });
    if (!response.ok || response.body === null) {
      throw new Error(
        `GET ${url} for the board stream returned status ${String(response.status)}; expected a 200 text/event-stream response.`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        throw new Error(
          `The board stream ${url} closed; expected an open text/event-stream connection.`,
        );
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        handleFrame(frame, onBoard);
      }
    }
  } catch (error) {
    if (signal.aborted) {
      return;
    }
    onError(error);
  }
}

export interface BoardStreamState {
  snapshot: BoardSnapshot | null;
  /** `true` once the stream has failed `MAX_STREAM_FAILURES` times in a row — the
   * caller then falls back to polling `GET /monitoring/board`. */
  fallback: boolean;
}

/** Subscribe to the board stream for the lifetime of the component. Reconnects
 * with exponential backoff after a failure; gives up (sets `fallback`) after
 * `MAX_STREAM_FAILURES` consecutive failures. Aborts on unmount. */
export function useBoardStream(token: string, streamUrl: string): BoardStreamState {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (token === "") {
      return;
    }

    const controller = new AbortController();
    let failures = 0;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function connect(): void {
      if (stopped) {
        return;
      }
      void subscribeToBoard({
        url: streamUrl,
        token,
        signal: controller.signal,
        onBoard: (next) => {
          failures = 0;
          setSnapshot(next);
        },
        onError: () => {
          failures += 1;
          if (failures >= MAX_STREAM_FAILURES) {
            setFallback(true);

            return;
          }

          const delaySeconds = Math.min(2 ** failures, MAX_BACKOFF_SECONDS);
          retryTimer = setTimeout(connect, delaySeconds * 1000);
        },
      });
    }

    setFallback(false);
    connect();

    return () => {
      stopped = true;
      controller.abort();
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
      }
    };
  }, [token, streamUrl]);

  return { snapshot, fallback };
}
