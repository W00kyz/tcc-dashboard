import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { RegistryLayout, RegistryList } from "@/components/layout/Registry";
import { ChevronRight } from "lucide-react";

interface BuildingRow {
  id: string;
  name: string;
  campus_area: string;
  footprint: unknown;
}

export function BuildingsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors RouteBoardPage/UsersPage/ContractorCompaniesPage/FieldWorkersPage's convention:
  // fall back to an empty token instead of asserting a non-null session, so the page renders
  // (and its request fails cleanly) even before the session has hydrated from storage.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data: buildings } = useQuery({
    queryKey: ["buildings"],
    queryFn: async () => {
      const { data } = await client.GET("/buildings");

      return data as BuildingRow[];
    },
  });

  const [name, setName] = useState("");
  const [campusArea, setCampusArea] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      await client.POST("/buildings", { body: { name, campus_area: campusArea } });
    },
    onSuccess: () => {
      setName("");
      setCampusArea("");
      void queryClient.invalidateQueries({ queryKey: ["buildings"] });
    },
  });

  return (
    <Page>
      <PageHeader title={t("buildingsPageTitle")} />
      <RegistryLayout
        list={
          <RegistryList
            items={buildings}
            getKey={(building) => building.id}
            renderItem={(building) => (
              <>
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block font-semibold">{building.name}</span>
                  <span className="text-muted-foreground text-sm">{building.campus_area}</span>
                </span>
                <Badge variant={building.footprint ? "done" : "pending"}>
                  {t(building.footprint ? "footprintBadgeLinked" : "footprintBadgeMissing")}
                </Badge>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/predios/${building.id}/andares`}>
                    {t("buildingsViewFloors")}
                    <ChevronRight aria-hidden="true" />
                  </Link>
                </Button>
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
              <Label htmlFor="building-name">{t("buildingsFieldName")}</Label>
              <Input
                id="building-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="building-campus-area">{t("buildingsFieldCampusArea")}</Label>
              <Input
                id="building-campus-area"
                value={campusArea}
                onChange={(event) => {
                  setCampusArea(event.target.value);
                }}
              />
            </div>
            <Button type="submit" className="w-full">
              {t("buildingsSubmitCreate")}
            </Button>
          </form>
        }
      />
    </Page>
  );
}
