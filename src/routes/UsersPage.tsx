import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";

type UserRole = "ADMIN" | "MANAGER" | "FIELD_WORKER";
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
}

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
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("usersPageTitle")}</h1>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          createUser.mutate();
        }}
      >
        <div>
          <Label htmlFor="user-name">{t("usersFieldName")}</Label>
          <Input
            id="user-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        <div>
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
        <div>
          <Label htmlFor="user-role">{t("usersFieldRole")}</Label>
          <select
            id="user-role"
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={role}
            onChange={(event) => {
              setRole(event.target.value as UserRole);
            }}
          >
            <option value="ADMIN">{t("usersRoleAdmin")}</option>
            <option value="MANAGER">{t("usersRoleManager")}</option>
            <option value="FIELD_WORKER">{t("usersRoleFieldWorker")}</option>
          </select>
        </div>
        <Button type="submit">{t("usersSubmitCreate")}</Button>
      </form>

      <ul className="divide-border divide-y">
        {users?.map((user) => (
          <li key={user.id} className="flex items-center justify-between py-2">
            <span>
              <span className="font-medium">{user.name}</span>{" "}
              <span className="text-muted-foreground">{user.email}</span>
            </span>
            <Button
              variant="outline"
              onClick={() => {
                toggleActive.mutate({ id: user.id, activate: !user.is_active });
              }}
            >
              {user.is_active ? t("usersDeactivate") : t("usersActivate")}
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}
