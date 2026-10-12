import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { RegistryLayout, RegistryList } from "@/components/layout/Registry";
import type { StringKey } from "@/i18n/strings";

type UserRole = "ADMIN" | "MANAGER" | "FIELD_WORKER";
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

const USER_ROLE_LABEL: Record<UserRole, StringKey> = {
  ADMIN: "usersRoleAdmin",
  MANAGER: "usersRoleManager",
  FIELD_WORKER: "usersRoleFieldWorker",
};

export function UsersPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  // Mirrors RouteBoardPage's convention: fall back to an empty token instead of
  // asserting a non-null session, so the page renders (and its request fails cleanly)
  // even before the session has hydrated from storage, rather than crashing on mount.
  const client = createApiClient(apiBaseUrl, session?.accessToken ?? "");

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data } = await client.GET("/users");

      return data as UserRow[];
    },
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("FIELD_WORKER");

  const createUser = useMutation({
    mutationFn: async () => {
      await client.POST("/users", { body: { name, email, role } });
    },
    // Reset every field the form owns, not just name/email (the same partial-reset bug
    // Tasks 12/14/15 each found and fixed in this etapa's other create forms) — leaving
    // role behind would keep the selector on, e.g., "Administrador" for the next entry.
    onSuccess: () => {
      setName("");
      setEmail("");
      setRole("FIELD_WORKER");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, activate }: { id: string; activate: boolean }) => {
      await client.POST(activate ? "/users/{user_id}/activate" : "/users/{user_id}/deactivate", {
        params: { path: { user_id: id } },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <Page>
      <PageHeader title={t("usersPageTitle")} />

      <RegistryLayout
        list={
          <RegistryList
            items={users}
            getKey={(user) => user.id}
            renderItem={(user) => (
              <>
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block font-semibold">{user.name}</span>
                  <span className="text-muted-foreground text-sm break-all">{user.email}</span>
                </span>
                <Badge variant="outline">{t(USER_ROLE_LABEL[user.role])}</Badge>
                <Badge variant={user.is_active ? "done" : "pending"}>
                  {user.is_active ? t("usersStatusActive") : t("usersStatusInactive")}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    toggleActive.mutate({ id: user.id, activate: !user.is_active });
                  }}
                >
                  {user.is_active ? t("usersDeactivate") : t("usersActivate")}
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
              createUser.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="user-name">{t("usersFieldName")}</Label>
              <Input
                id="user-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-email">{t("usersFieldEmail")}</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-role">{t("usersFieldRole")}</Label>
              <NativeSelect
                id="user-role"
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as UserRole);
                }}
              >
                <NativeSelectOption value="ADMIN">{t("usersRoleAdmin")}</NativeSelectOption>
                <NativeSelectOption value="MANAGER">{t("usersRoleManager")}</NativeSelectOption>
                <NativeSelectOption value="FIELD_WORKER">
                  {t("usersRoleFieldWorker")}
                </NativeSelectOption>
              </NativeSelect>
            </div>
            <Button type="submit" className="w-full">
              {t("usersSubmitCreate")}
            </Button>
          </form>
        }
      />
    </Page>
  );
}
