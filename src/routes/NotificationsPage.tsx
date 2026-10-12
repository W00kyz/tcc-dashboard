import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  fetchNotifications,
  formatNotificationTime,
  NOTIFICATION_KIND_LABEL_KEY,
  useNotificationActions,
} from "@/components/notifications/useNotifications";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState, ErrorMessage, LoadingMessage } from "@/components/layout/StateMessages";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const { t } = useTranslation();
  const { client, markRead, markAllRead, openNotification } = useNotificationActions();

  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications", "list", { unreadOnly, page }],
    queryFn: () => fetchNotifications(client, unreadOnly, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Page>
      <PageHeader
        title={t("notificationsTitle")}
        actions={
          <Button
            variant="outline"
            disabled={markAllRead.isPending}
            onClick={() => {
              markAllRead.mutate();
            }}
          >
            <CheckCheck aria-hidden="true" />
            {t("notificationsMarkAllRead")}
          </Button>
        }
      />

      <label className="flex w-fit items-center gap-2 text-sm font-semibold">
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
        <ErrorMessage>{t("notificationsMarkReadError")}</ErrorMessage>
      )}

      {isLoading && <LoadingMessage>{t("notificationsLoading")}</LoadingMessage>}
      {error && <ErrorMessage>{t("notificationsError")}</ErrorMessage>}
      {!isLoading && !error && items.length === 0 && (
        <EmptyState>{t("notificationsEmpty")}</EmptyState>
      )}

      {items.length > 0 && (
        <ul className="bg-card divide-y rounded-md border">
          {items.map((notification) => {
            const unread = notification.read_at === null;

            return (
              <li key={notification.id}>
                <button
                  type="button"
                  className={cn(
                    "hover:bg-accent flex w-full gap-3 px-4 py-3.5 text-left transition-colors focus-visible:outline-offset-[-2px]",
                    unread && "bg-signal-soft/50",
                  )}
                  onClick={() => {
                    openNotification(notification);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      unread ? "bg-signal ring-signal-foreground/20 ring-2" : "bg-transparent",
                    )}
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant="pending">
                        {t(
                          NOTIFICATION_KIND_LABEL_KEY[notification.kind] ?? "notificationKindOther",
                        )}
                      </Badge>
                      {unread && <Badge variant="signal">{t("notificationUnreadLabel")}</Badge>}
                      <span className="text-muted-foreground text-xs">
                        {formatNotificationTime(notification.created_at)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "block",
                        unread ? "text-primary font-bold" : "text-foreground font-semibold",
                      )}
                    >
                      {notification.title}
                    </span>
                    <span className="text-muted-foreground block text-sm">{notification.body}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("notificationsPaginationLabel")} {page} {t("notificationsPaginationOf")} {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              <ChevronLeft aria-hidden="true" />
              {t("notificationsPrevPage")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => {
                setPage((current) => current + 1);
              }}
            >
              {t("notificationsNextPage")}
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </Page>
  );
}
