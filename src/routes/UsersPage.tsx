import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { decodeJwtSubject } from "@/auth/decodeJwtRole";
import { ROLE_LABEL_KEY } from "@/auth/roleLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n/useTranslation";
import { Page, PageHeader } from "@/components/layout/Page";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { RegistryList, RegistryNewButton } from "@/components/layout/Registry";
import { RegistryDialog, useRegistryDialog } from "@/components/layout/RegistryDialog";
import { assertSaved, RegistryEditButton } from "@/components/layout/registryForm";

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

  const dialog = useRegistryDialog({ name: "", email: "", role: "FIELD_WORKER" }, [
    "name",
    "email",
  ]);
  const { form } = dialog;
  // An admin deactivating (or demoting) their own account would lock themselves out of this
  // very page, so their own row offers neither.
  const ownUserId = session === null ? null : decodeJwtSubject(session.accessToken);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.values.name.trim(),
        email: form.values.email.trim(),
        role: form.values.role as UserRole,
      };
      if (form.editingId !== null) {
        const { response } = await client.PATCH("/users/{user_id}", {
          params: { path: { user_id: form.editingId } },
          body,
        });
        assertSaved(response, `PATCH /users/${form.editingId}`);

        return;
      }
      const { response } = await client.POST("/users", { body });
      assertSaved(response, "POST /users");
    },
    // Reset every field the form owns, not just name/email (the same partial-reset bug
    // Tasks 12/14/15 each found and fixed in this etapa's other create forms) — leaving
    // role behind would keep the selector on, e.g., "Administrador" for the next entry.
    onSuccess: () => {
      dialog.close();
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
      <PageHeader
        title={t("usersPageTitle")}
        actions={
          <RegistryNewButton
            label={t("usersNew")}
            onClick={() => {
              save.reset();
              dialog.openNew();
            }}
          />
        }
      />

      <RegistryList
        items={users}
        getKey={(user) => user.id}
        renderItem={(user) => (
          <>
            <span className="min-w-0 flex-1">
              <span className="text-foreground block font-semibold">{user.name}</span>
              <span className="text-muted-foreground text-sm break-all">{user.email}</span>
            </span>
            <Badge variant="outline">{t(ROLE_LABEL_KEY[user.role])}</Badge>
            <Badge variant={user.is_active ? "done" : "pending"}>
              {user.is_active ? t("usersStatusActive") : t("usersStatusInactive")}
            </Badge>
            <RegistryEditButton
              itemName={user.name}
              onEdit={() => {
                save.reset();
                dialog.openEdit(user.id, {
                  name: user.name,
                  email: user.email,
                  role: user.role,
                });
              }}
            />
            {user.id === ownUserId ? (
              <Badge variant="outline">{t("usersYou")}</Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={toggleActive.isPending}
                onClick={() => {
                  toggleActive.mutate({ id: user.id, activate: !user.is_active });
                }}
              >
                {user.is_active ? t("usersDeactivate") : t("usersActivate")}
              </Button>
            )}
          </>
        )}
      />
      <RegistryDialog
        dialog={dialog}
        save={save}
        createLabel={t("usersSubmitCreate")}
        fieldLabels={{ name: t("usersFieldName"), email: t("usersFieldEmail") }}
        onSubmit={() => {
          save.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="user-name">{t("usersFieldName")}</Label>
          <Input
            id="user-name"
            value={form.values.name}
            aria-invalid={form.isInvalid("name")}
            onChange={(event) => {
              form.setField("name", event.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="user-email">{t("usersFieldEmail")}</Label>
          <Input
            id="user-email"
            type="email"
            value={form.values.email}
            aria-invalid={form.isInvalid("email")}
            onChange={(event) => {
              form.setField("email", event.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="user-role">{t("usersFieldRole")}</Label>
          <NativeSelect
            id="user-role"
            value={form.values.role}
            disabled={form.editingId !== null && form.editingId === ownUserId}
            onChange={(event) => {
              form.setField("role", event.target.value);
            }}
          >
            <NativeSelectOption value="ADMIN">{t("roleLabelAdmin")}</NativeSelectOption>
            <NativeSelectOption value="MANAGER">{t("roleLabelManager")}</NativeSelectOption>
            <NativeSelectOption value="FIELD_WORKER">
              {t("roleLabelFieldWorker")}
            </NativeSelectOption>
          </NativeSelect>
        </div>
      </RegistryDialog>
    </Page>
  );
}
