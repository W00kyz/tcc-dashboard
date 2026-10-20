import { vi } from "vitest";

/** The JSON body (or a ready Response) to answer a request with. */
type ReplyFn = (request: RecordedRequest) => unknown;

export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

interface Route {
  method: string;
  path: string;
  reply: ReplyFn;
  status: number;
}

function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  return input instanceof Request ? input : new Request(input, init);
}

async function readBody(request: Request): Promise<unknown> {
  const text = await request.clone().text();

  return text === "" ? undefined : (JSON.parse(text) as unknown);
}

/**
 * Stands in for the backend in component tests: answers by method and path instead of by call
 * order, so adding a query to a page does not shift every queued response. Unknown requests get
 * a 404 and stay in `requests` for the assertion that explains them.
 * @example const api = new FakeApi().on("GET", "/buildings", []).install();
 */
export class FakeApi {
  readonly requests: RecordedRequest[] = [];
  private readonly routes: Route[] = [];

  /** The latest registration for a method+path wins, so a test can override a default. */
  on(method: string, path: string, body: unknown, status = 200): this {
    return this.onRequest(method, path, () => body, status);
  }

  /** Like `on`, with the body computed from the request. */
  onRequest(method: string, path: string, reply: ReplyFn, status = 200): this {
    this.routes.unshift({ method, path, reply, status });

    return this;
  }

  install(): this {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      this.handle(toRequest(input, init)),
    );

    return this;
  }

  /** Requests sent with `method` to `path`, oldest first. */
  sent(method: string, path: string): RecordedRequest[] {
    return this.requests.filter((request) => request.method === method && request.path === path);
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const recorded: RecordedRequest = {
      method: request.method,
      path: url.pathname,
      query: url.searchParams,
      body: await readBody(request),
    };
    this.requests.push(recorded);
    const route = this.routes.find(
      (candidate) => candidate.method === recorded.method && candidate.path === recorded.path,
    );
    if (route === undefined) {
      return new Response(JSON.stringify({ detail: "not faked" }), { status: 404 });
    }

    const reply = route.reply(recorded);

    // A ready Response passes through untouched (a PDF, an empty 204).
    return reply instanceof Response
      ? reply
      : new Response(JSON.stringify(reply ?? null), { status: route.status });
  }
}
