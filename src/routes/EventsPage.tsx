import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { RegistryLayout, RegistryList } from "@/components/layout/Registry";
import { formatIsoDateBr } from "@/lib/dates";

interface EventRow {
  id: string;
  name: string;
  valid_from: string;
  valid_until: string;
}

export function EventsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors RouteBoardPage/UsersPage's convention: fall back to an empty token instead of
  // asserting a non-null session, so the page renders (and its request fails cleanly)
  // even before the session has hydrated from storage, rather than crashing on mount.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data: events } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data } = await client.GET("/events");

      return data as EventRow[];
    },
  });

  const [name, setName] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      await client.POST("/events", {
        body: { name, valid_from: validFrom, valid_until: validUntil },
      });
    },
    onSuccess: () => {
      setName("");
      setValidFrom("");
      setValidUntil("");
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  return (
    <Page>
      <PageHeader title={t("eventsPageTitle")} />
      <RegistryLayout
        list={
          <RegistryList
            items={events}
            getKey={(event) => event.id}
            renderItem={(event) => (
              <>
                <span className="text-foreground min-w-0 flex-1 font-semibold">{event.name}</span>
                <span className="text-muted-foreground text-sm">
                  {formatIsoDateBr(event.valid_from)} a {formatIsoDateBr(event.valid_until)}
                </span>
              </>
            )}
          />
        }
        form={
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="event-name">{t("eventsFieldName")}</Label>
              <Input
                id="event-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-valid-from">{t("eventsFieldValidFrom")}</Label>
              <Input
                id="event-valid-from"
                type="date"
                value={validFrom}
                onChange={(event) => {
                  setValidFrom(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-valid-until">{t("eventsFieldValidUntil")}</Label>
              <Input
                id="event-valid-until"
                type="date"
                value={validUntil}
                onChange={(event) => {
                  setValidUntil(event.target.value);
                }}
              />
            </div>
            <Button type="submit" className="w-full">
              {t("eventsSubmitCreate")}
            </Button>
          </form>
        }
      />
    </Page>
  );
}
