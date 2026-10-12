import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import type { StringKey } from "@/i18n/strings";

type ApiClient = ReturnType<typeof createApiClient>;
export type Notification = components["schemas"]["NotificationOut"];

// Shared query-key prefix: the unread badges (sidebar, header bell) live under
// ["notifications", ...], so invalidating ["notifications"] refreshes lists and counts at once.
export const NOTIFICATIONS_KEY = ["notifications"] as const;
export const UNREAD_COUNT_KEY = ["notifications", "unread-count"] as const;

export const NOTIFICATION_KIND_LABEL_KEY: Record<string, StringKey> = {
  ALERT: "notificationKindAlert",
  ROUTE_ASSIGNED: "notificationKindRouteAssigned",
  ROUTE_MODIFIED: "notificationKindRouteModified",
  STOP_REASSIGNED: "notificationKindStopReassigned",
  IMPEDIMENT_REPORTED: "notificationKindImpedimentReported",
};

export function formatNotificationTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Best-effort deep link: the route board is the only place that renders alerts and route
// context, so both `alert_id` and `route_id` point there. No useful target → just mark read.
export function notificationTarget(data: Notification["data"]): string | null {
  // RF17: an impediment is worked from the reassignment queue, not the board.
  if (typeof data.impediment_id === "string") {
    return "/reatribuicoes";
  }
  if (typeof data.route_id === "string" || typeof data.alert_id === "string") {
    return "/rotas";
  }

  return null;
}

/** GET /notifications/me, one page. Example: `fetchNotifications(client, false, 1, 20)`. */
export async function fetchNotifications(
  client: ApiClient,
  unreadOnly: boolean,
  page: number,
  pageSize: number,
) {
  const { data, response } = await client.GET("/notifications/me", {
    params: { query: { unread_only: unreadOnly, page, page_size: pageSize } },
  });
  if (!response.ok) {
    throw new Error(`GET /notifications/me failed (${String(response.status)}).`);
  }

  return data ?? { items: [], total: 0, page, page_size: pageSize };
}

/**
 * Mark-read, mark-all-read and "open" (mark read, then follow the deep link), shared by the
 * notifications page and the header bell so both behave the same.
 */
export function useNotificationActions() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  };

  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { response } = await client.POST("/notifications/{notification_id}/read", {
        params: { path: { notification_id: notificationId } },
      });
      if (!response.ok) {
        throw new Error(
          `POST /notifications/${notificationId}/read failed (${String(response.status)}).`,
        );
      }
    },
    onSuccess: refresh,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/notifications/me/read-all");
      if (!response.ok) {
        throw new Error(`POST /notifications/me/read-all failed (${String(response.status)}).`);
      }
    },
    onSuccess: refresh,
  });

  function openNotification(notification: Notification) {
    if (notification.read_at === null) {
      markRead.mutate(notification.id);
    }
    const target = notificationTarget(notification.data);
    if (target !== null) {
      void navigate(target);
    }
  }

  return { client, markRead, markAllRead, openNotification };
}
