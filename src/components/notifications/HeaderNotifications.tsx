import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { LoadingMessage } from "@/components/layout/StateMessages";
import {
  fetchNotifications,
  formatNotificationTime,
  NOTIFICATION_KIND_LABEL_KEY,
  type Notification,
  UNREAD_COUNT_KEY,
  useNotificationActions,
} from "@/components/notifications/useNotifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/i18n/useTranslation";
import { cn } from "@/lib/utils";

const RECENT_COUNT = 6;

function NotificationItem({
  notification,
  onOpen,
}: {
  notification: Notification;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const unread = notification.read_at === null;

  return (
    <DropdownMenuItem
      onSelect={onOpen}
      className={cn("items-start gap-3 rounded-none px-4 py-3", unread && "bg-signal-soft/50")}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          unread ? "bg-signal" : "bg-transparent",
        )}
      />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-2">
          <Badge variant="pending" className="px-1.5">
            {t(NOTIFICATION_KIND_LABEL_KEY[notification.kind] ?? "notificationKindOther")}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {formatNotificationTime(notification.created_at)}
          </span>
        </span>
        <span className={cn("block truncate", unread ? "text-primary font-bold" : "font-semibold")}>
          {notification.title}
          {unread && <span className="sr-only"> · {t("notificationUnreadLabel")}</span>}
        </span>
        <span className="text-muted-foreground block truncate text-xs">{notification.body}</span>
      </span>
    </DropdownMenuItem>
  );
}

/**
 * The header bell: unread count at a glance, the latest notifications one click away, and a
 * way through to the full list. Shares the unread-count query with the sidebar badge.
 */
export function HeaderNotifications() {
  const { t } = useTranslation();
  const { client, markAllRead, openNotification } = useNotificationActions();
  const [open, setOpen] = useState(false);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: async () => {
      const { data } = await client.GET("/notifications/me/unread-count");

      return data?.count ?? 0;
    },
    // SSE stand-in: poll so the badge tracks new notifications without a manual refresh.
    refetchInterval: 30_000,
  });

  // Only fetched while the menu is open: the bell itself needs nothing but the count.
  const recent = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => fetchNotifications(client, false, 1, RECENT_COUNT),
    enabled: open,
  });

  const label =
    unreadCount === 0
      ? t("headerNotificationsLabel")
      : unreadCount === 1
        ? t("headerNotificationsLabelUnreadOne")
        : t("headerNotificationsLabelUnread").replace("{n}", String(unreadCount));
  const items = recent.data?.items ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={label} title={label}>
          <Bell aria-hidden="true" className="size-5" />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="bg-signal text-signal-foreground ring-background absolute -top-0.5 -right-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[0.6875rem] leading-none font-bold ring-2"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <span className="text-primary text-sm font-bold">{t("notificationsTitle")}</span>
          <Button
            variant="ghost"
            size="xs"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={() => {
              markAllRead.mutate();
            }}
          >
            <CheckCheck aria-hidden="true" />
            {t("notificationsMarkAllRead")}
          </Button>
        </div>
        <div className="max-h-[22rem] overflow-y-auto">
          {recent.isLoading && (
            <div className="px-4 py-4">
              <LoadingMessage>{t("notificationsLoading")}</LoadingMessage>
            </div>
          )}
          {!recent.isLoading && items.length === 0 && (
            <p className="text-muted-foreground px-4 py-6 text-center text-sm">
              {t("notificationsEmpty")}
            </p>
          )}
          {items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onOpen={() => {
                openNotification(notification);
              }}
            />
          ))}
        </div>
        <DropdownMenuItem asChild className="justify-center rounded-none border-t py-2.5">
          <Link to="/notificacoes" className="text-primary text-sm font-semibold">
            {t("headerNotificationsSeeAll")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
