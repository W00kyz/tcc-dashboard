import { afterEach, describe, expect, it, vi } from "vitest";

import { authAwareFetch, registerAuthFetchHandlers } from "@/api/authFetch";

const URL_ME = "http://localhost:8000/routes";

class FakeSessionOwner {
  accessToken: string | null = "fresh-token";
  refreshCalls = 0;
  nextRefresh: string | null = "refreshed-token";

  handlers() {
    return {
      currentAccessToken: () => this.accessToken,
      refreshAccessToken: () => {
        this.refreshCalls += 1;
        this.accessToken = this.nextRefresh;

        return Promise.resolve(this.nextRefresh);
      },
    };
  }
}

function sentAuthorization(fakeFetch: ReturnType<typeof vi.fn>, call: number): string | null {
  const request = fakeFetch.mock.calls[call]?.[0] as Request;

  return request.headers.get("Authorization");
}

describe("authAwareFetch", () => {
  let unregister: () => void = () => undefined;

  afterEach(() => {
    unregister();
    vi.restoreAllMocks();
  });

  it("passes a request without Authorization straight through", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fakeFetch;
    unregister = registerAuthFetchHandlers(new FakeSessionOwner().handlers());

    await authAwareFetch("http://localhost:8000/auth/login", { method: "POST" });

    expect(fakeFetch).toHaveBeenCalledWith("http://localhost:8000/auth/login", {
      method: "POST",
    });
  });

  it("swaps a stale bearer for the session's newest access token", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fakeFetch;
    unregister = registerAuthFetchHandlers(new FakeSessionOwner().handlers());

    await authAwareFetch(URL_ME, { headers: { Authorization: "Bearer stale-token" } });

    expect(sentAuthorization(fakeFetch, 0)).toBe("Bearer fresh-token");
  });

  it("refreshes once on 401 and retries with the new token", async () => {
    const fakeFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));
    globalThis.fetch = fakeFetch;
    const owner = new FakeSessionOwner();
    unregister = registerAuthFetchHandlers(owner.handlers());

    const response = await authAwareFetch(URL_ME, {
      headers: { Authorization: "Bearer fresh-token" },
    });

    expect(response.status).toBe(200);
    expect(owner.refreshCalls).toBe(1);
    expect(sentAuthorization(fakeFetch, 1)).toBe("Bearer refreshed-token");
  });

  it("returns the original 401 when the refresh is refused", async () => {
    const fakeFetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    globalThis.fetch = fakeFetch;
    const owner = new FakeSessionOwner();
    owner.nextRefresh = null;
    unregister = registerAuthFetchHandlers(owner.handlers());

    const response = await authAwareFetch(URL_ME, {
      headers: { Authorization: "Bearer fresh-token" },
    });

    expect(response.status).toBe(401);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});
