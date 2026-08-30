import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

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
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("eventsPageTitle")}</h1>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <Label htmlFor="event-name">{t("eventsFieldName")}</Label>
          <Input
            id="event-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <div>
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
        <div>
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
        <Button type="submit">{t("eventsSubmitCreate")}</Button>
      </form>
      <ul className="divide-border divide-y">
        {events?.map((event) => (
          <li key={event.id} className="py-2">
            <span className="font-medium">{event.name}</span>{" "}
            <span className="text-muted-foreground">
              {event.valid_from} a {event.valid_until}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
