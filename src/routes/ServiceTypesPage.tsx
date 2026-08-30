import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

interface ServiceTypeRow {
  id: string;
  name: string;
  average_duration_minutes: number;
}

export function ServiceTypesPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors RouteBoardPage/UsersPage's convention: fall back to an empty token instead of
  // asserting a non-null session, so the page renders (and its request fails cleanly)
  // even before the session has hydrated from storage, rather than crashing on mount.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data: serviceTypes } = useQuery({
    queryKey: ["service-types"],
    queryFn: async () => {
      const { data } = await client.GET("/service-types");

      return data as ServiceTypeRow[];
    },
  });

  const [name, setName] = useState("");
  const [duration, setDuration] = useState(30);

  const create = useMutation({
    mutationFn: async () => {
      await client.POST("/service-types", { body: { name, average_duration_minutes: duration } });
    },
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["service-types"] });
    },
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("serviceTypesPageTitle")}</h1>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <Label htmlFor="service-type-name">{t("serviceTypesFieldName")}</Label>
          <Input
            id="service-type-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="service-type-duration">{t("serviceTypesFieldDuration")}</Label>
          <Input
            id="service-type-duration"
            type="number"
            value={duration}
            onChange={(event) => {
              setDuration(Number(event.target.value));
            }}
          />
        </div>
        <Button type="submit">{t("serviceTypesSubmitCreate")}</Button>
      </form>
      <ul className="divide-border divide-y">
        {serviceTypes?.map((item) => (
          <li key={item.id} className="py-2">
            <span className="font-medium">{item.name}</span>{" "}
            <span className="text-muted-foreground">{item.average_duration_minutes} min</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
