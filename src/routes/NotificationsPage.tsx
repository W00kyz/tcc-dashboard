import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import type { StringKey } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";

type ApiClient = ReturnType<typeof createApiClient>;
type Notification = components["schemas"]["NotificationOut"];

const PAGE_SIZE = 20;

// Shared query-key prefix: the unread badge in AppNav lives under ["notifications", ...],
// so invalidating ["notifications"] refreshes both the list and the badge count.
const NOTIFICATIONS_KEY = ["notifications"] as const;

const KIND_LABEL_KEY: Record<string, StringKey> = {
  ALERT: "notificationKindAlert",
  ROUTE_ASSIGNED: "notificationKindRouteAssigned",
  ROUTE_MODIFIED: "notificationKindRouteModified",
  STOP_REASSIGNED: "notificationKindStopReassigned",
  IMPEDIMENT_REPORTED: "notificationKindImpedimentReported",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Best-effort deep link: the route board is the only place that renders alerts and route
// context, so both `alert_id` and `route_id` point there. No useful target → just mark read.
function targetFor(data: Notification["data"]): string | null {
  // RF17: an impediment is worked from the reassignment queue, not the board.
  if (typeof data.impediment_id === "string") {
    return "/reatribuicoes";
  }
  if (typeof data.route_id === "string" || typeof data.alert_id === "string") {
    return "/rotas";
  }

  return null;
}

async function fetchNotifications(client: ApiClient, unreadOnly: boolean, page: number) {
  const { data, response } = await client.GET("/notifications/me", {
    params: { query: { unread_only: unreadOnly, page, page_size: PAGE_SIZE } },
  });
  if (!response.ok) {
    throw new Error(`GET /notifications/me failed (${String(response.status)}).`);
  }

  return data ?? { items: [], total: 0, page, page_size: PAGE_SIZE };
}

export function NotificationsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications", "list", { unreadOnly, page }],
    queryFn: () => fetchNotifications(client, unreadOnly, page),
    placeholderData: keepPreviousData,
  });

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { response } = await client.POST("/notifications/me/read-all");
      if (!response.ok) {
        throw new Error(`POST /notifications/me/read-all failed (${String(response.status)}).`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });

  function openNotification(notification: Notification) {
    if (notification.read_at === null) {
      markRead.mutate(notification.id);
    }
    const target = targetFor(notification.data);
    if (target !== null) {
      void navigate(target);
    }
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("notificationsTitle")}</h1>
        <Button
          size="sm"
          variant="outline"
          disabled={markAllRead.isPending}
          onClick={() => {
            markAllRead.mutate();
          }}
        >
          {t("notificationsMarkAllRead")}
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(event) => {
            setPage(1);
            setUnreadOnly(event.target.checked);
          }}
        />
        {t("notificationsUnreadOnly")}
      </label>

      {(markRead.isError || markAllRead.isError) && (
        <p role="alert" className="text-destructive text-sm">
          {t("notificationsMarkReadError")}
        </p>
      )}

      {isLoading && <p className="text-muted-foreground">{t("notificationsLoading")}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {t("notificationsError")}
        </p>
      )}
      {!isLoading && !error && items.length === 0 && (
        <p className="text-muted-foreground">{t("notificationsEmpty")}</p>
      )}

      <ul className="divide-border divide-y">
        {items.map((notification) => {
          const unread = notification.read_at === null;

          return (
            <li key={notification.id}>
              <button
                type="button"
                data-testid={`notification-${notification.id}`}
                data-unread={unread ? "true" : "false"}
                className="hover:bg-muted/50 w-full space-y-1 px-1 py-3 text-left"
                onClick={() => {
                  openNotification(notification);
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium">
                    {t(KIND_LABEL_KEY[notification.kind] ?? "notificationKindOther")}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatDateTime(notification.created_at)}
                  </span>
                </div>
                <p className={unread ? "font-semibold" : undefined}>{notification.title}</p>
                <p className="text-muted-foreground text-sm">{notification.body}</p>
              </button>
            </li>
          );
        })}
      </ul>

      {items.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span>
            {t("notificationsPaginationLabel")} {page} {t("notificationsPaginationOf")} {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border px-3 py-1 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              {t("notificationsPrevPage")}
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1 disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => {
                setPage((current) => current + 1);
              }}
            >
              {t("notificationsNextPage")}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
