import { useQuery } from "@tanstack/react-query";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";

// Shared prefix of everything the Justificativas page and its badge read: invalidating it
// after a decision refreshes the lists and the sidebar count together.
export const JUSTIFICATIONS_KEY = ["justifications"] as const;

/**
 * Impediments plus appeals still waiting for a manager, for the sidebar badge. Polled like the
 * notifications badge, so it tracks new reports without a manual refresh.
 *
 * @example const pending = usePendingJustificationsCount(true); // number | undefined while loading
 */
export function usePendingJustificationsCount(enabled: boolean): number | undefined {
  const { session } = useAuth();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data } = useQuery({
    queryKey: [...JUSTIFICATIONS_KEY, "pending-count"],
    queryFn: async () => {
      const [impediments, appeals] = await Promise.all([
        client.GET("/impediments", { params: { query: { status: "PENDING" } } }),
        client.GET("/appeals", { params: { query: { status: "PENDING" } } }),
      ]);

      return (impediments.data?.length ?? 0) + (appeals.data?.length ?? 0);
    },
    enabled,
    refetchInterval: 30_000,
  });

  return data;
}
