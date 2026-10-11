/** Typed HTTP client over the generated OpenAPI schema (AD-04). Every caller gets this
 * instance instead of raw fetch — one seam to inject the base URL and the bearer token. */
import createClient from "openapi-fetch";

import { authAwareFetch } from "@/api/authFetch";
import type { paths } from "@/api/generated/schema";

export function createApiClient(
  baseUrl: string,
  accessToken?: string,
  fetch?: typeof globalThis.fetch,
) {
  return createClient<paths>({
    baseUrl,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    // Default: refresh-aware fetch (src/api/authFetch.ts). An injected fetch is used as-is.
    fetch: fetch ?? authAwareFetch,
  });
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string;
