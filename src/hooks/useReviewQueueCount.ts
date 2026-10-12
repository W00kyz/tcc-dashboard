import { useQuery } from "@tanstack/react-query";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";

/**
 * How many executions wait for a manager's review. One query key shared by the sidebar badge
 * and the board KPI, so both always show the same number from one request.
 *
 * @example const pending = useReviewQueueCount(true); // number | undefined while loading
 */
export function useReviewQueueCount(enabled: boolean): number | undefined {
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data } = useQuery({
    queryKey: ["executions", "review-count"],
    queryFn: async () => {
      const { data: page } = await client.GET("/executions", {
        params: { query: { review_status: "PENDING_REVIEW", page_size: 1 } },
      });

      return page?.total ?? 0;
    },
    enabled,
  });

  return data;
}
