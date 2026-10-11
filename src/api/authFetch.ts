/** A `fetch` that keeps the dashboard signed in past the access token's short lifetime
 * (15 minutes, JWT_ACCESS_TOKEN_MINUTES). Without it every page started failing with 401 a
 * quarter of an hour after login, with no way out but clearing localStorage by hand.
 *
 * Two jobs, both only for requests that already carry an `Authorization` header (public
 * endpoints such as /auth/login pass straight through):
 *   1. Swap in the newest access token — clients built before a refresh still hold the old one.
 *   2. On a 401, ask the session owner (`AuthProvider`) for a fresh token and retry once. When
 *      the refresh itself fails the owner signs the user out and the original 401 is returned.
 *
 * The session owner plugs in through `registerAuthFetchHandlers`; with nothing registered
 * (unit tests that render a page without `AuthProvider`) this is a plain `fetch`.
 *
 *     const client = createClient<paths>({ baseUrl, fetch: authAwareFetch });
 */
export interface AuthFetchHandlers {
  currentAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
}

let handlers: AuthFetchHandlers | null = null;

export function registerAuthFetchHandlers(next: AuthFetchHandlers): () => void {
  handlers = next;

  return () => {
    if (handlers === next) {
      handlers = null;
    }
  };
}

function hasAuthorization(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (init?.headers !== undefined) {
    return new Headers(init.headers).has("Authorization");
  }

  return input instanceof Request && input.headers.has("Authorization");
}

function withBearer(request: Request, token: string): Request {
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return new Request(request, { headers });
}

export async function authAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const active = handlers;
  // Pass-through keeps the caller's own arguments, untouched. Headers are read without
  // building a `new Request(input)` — that would consume the original request's body.
  if (active === null || !hasAuthorization(input, init)) {
    return globalThis.fetch(input, init);
  }

  const request = new Request(input, init);
  // Cloned before the first send: a request body can only be read once.
  const retry = request.clone();
  const latest = active.currentAccessToken();
  const response = await globalThis.fetch(latest ? withBearer(request, latest) : request);
  if (response.status !== 401) {
    return response;
  }

  const fresh = await active.refreshAccessToken();
  if (fresh === null) {
    return response;
  }

  return globalThis.fetch(withBearer(retry, fresh));
}
