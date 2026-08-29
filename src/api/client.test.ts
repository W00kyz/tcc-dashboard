import { describe, expect, it } from "vitest";

import { createApiClient } from "@/api/client";

describe("createApiClient", () => {
  it("attaches the bearer token when one is provided", async () => {
    let capturedHeaders: Headers | undefined;
    const fakeFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (input instanceof Request) {
        capturedHeaders = input.headers;
      } else if (init?.headers instanceof Headers) {
        capturedHeaders = init.headers;
      } else if (typeof init?.headers === "object") {
        capturedHeaders = new Headers(init.headers);
      }

      return Promise.resolve(new Response(null, { status: 200 }));
    };

    const client = createApiClient("http://localhost:8000", "a-test-token", fakeFetch);
    await client.GET("/health");

    expect(capturedHeaders?.get("Authorization")).toBe("Bearer a-test-token");
  });

  it("omits the Authorization header when no token is given", async () => {
    let capturedHeaders: Headers | undefined;
    const fakeFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (input instanceof Request) {
        capturedHeaders = input.headers;
      } else if (init?.headers instanceof Headers) {
        capturedHeaders = init.headers;
      } else if (typeof init?.headers === "object") {
        capturedHeaders = new Headers(init.headers);
      }

      return Promise.resolve(new Response(null, { status: 200 }));
    };

    const client = createApiClient("http://localhost:8000", undefined, fakeFetch);
    await client.GET("/health");

    expect(capturedHeaders?.get("Authorization")).toBeNull();
  });
});
