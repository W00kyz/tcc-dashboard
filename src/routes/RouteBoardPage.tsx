import { useQuery } from "@tanstack/react-query";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { RouteStopStrip } from "@/components/RouteStopStrip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/i18n/useTranslation";

async function fetchRoutes(accessToken: string) {
  const client = createApiClient(apiBaseUrl, accessToken);
  // The OpenAPI spec for GET /routes only declares the 200 response, so openapi-fetch
  // types `error` as always-undefined here; check `response.ok` instead to still catch
  // an undeclared 401/500 at runtime.
  const { data, response } = await client.GET("/routes");
  if (!response.ok) {
    throw new Error("failed-to-load-routes");
  }

  return data;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function RouteBoardPage() {
  const { t } = useTranslation();
  const { session } = useAuth();

  const {
    data: routes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["routes"],
    queryFn: () => fetchRoutes(session?.accessToken ?? ""),
    // Stands in for SSE (Stage 9) with a simple poll — enough for the walking skeleton's
    // "the panel shows it", not a claim of true real-time delivery.
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return <p className="p-6 text-muted-foreground">{t("routeBoardLoading")}</p>;
  }
  if (error) {
    return <p className="p-6 text-destructive">{t("routeBoardError")}</p>;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">{t("routeBoardTitle")}</h1>
      {routes?.length === 0 && <p className="text-muted-foreground">{t("routeBoardEmpty")}</p>}
      {routes?.map((route) => (
        <Card key={route.id}>
          <CardHeader>
            <CardTitle className="text-base">{route.field_worker_name}</CardTitle>
            <p className="font-mono text-xs text-muted-foreground">
              {route.started_at
                ? `${t("routeStartedAtPrefix")} ${formatTime(route.started_at)}`
                : t("routeBoardNotStarted")}
            </p>
          </CardHeader>
          <CardContent>
            <RouteStopStrip
              stops={route.stops.map((stop) => ({
                id: stop.id,
                orderIndex: stop.order_index,
                status: stop.status as "PENDING" | "DONE",
              }))}
            />
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
