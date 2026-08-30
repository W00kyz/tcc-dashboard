import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

interface BuildingRow {
  id: string;
  name: string;
  campus_area: string;
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
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("buildingsPageTitle")}</h1>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div>
          <Label htmlFor="building-name">{t("buildingsFieldName")}</Label>
          <Input
            id="building-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="building-campus-area">{t("buildingsFieldCampusArea")}</Label>
          <Input
            id="building-campus-area"
            value={campusArea}
            onChange={(event) => {
              setCampusArea(event.target.value);
            }}
          />
        </div>
        <Button type="submit">{t("buildingsSubmitCreate")}</Button>
      </form>
      <ul className="divide-border divide-y">
        {buildings?.map((building) => (
          <li key={building.id} className="flex items-center justify-between py-2">
            <span>{building.name}</span>
            <Link className="text-sm underline" to={`/predios/${building.id}/andares`}>
              {t("buildingsViewFloors")}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
