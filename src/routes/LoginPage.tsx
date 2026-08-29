import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { decodeJwtRole } from "@/auth/decodeJwtRole";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { strings } from "@/i18n/strings";
import { useTranslation } from "@/i18n/useTranslation";

// loginSchema is defined at module scope, outside any component, so the useTranslation()
// hook isn't available here — the validation messages come straight from the i18n
// dictionary instead of the hook, keeping "no fixed string in a component" intact.
const loginSchema = z.object({
  email: z.string().email(strings.loginEmailInvalid),
  password: z.string().min(1, strings.loginPasswordRequired),
});

type LoginFormValues = z.infer<typeof loginSchema>;

async function login(values: LoginFormValues) {
  const client = createApiClient(apiBaseUrl);
  const { data, error } = await client.POST("/auth/login", { body: values });
  if (error) {
    throw new Error("invalid-credentials");
  }

  return data;
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        role: decodeJwtRole(data.access_token),
      });
      // useNavigate()'s return type includes Promise<void> for data routers; the login
      // page has nothing useful to do once the redirect is kicked off.
      void navigate("/rotas", { replace: true });
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="font-mono text-sm uppercase tracking-wide text-muted-foreground">
            {t("loginSubtitle")}
          </p>
          <CardTitle className="text-xl font-semibold">{t("loginTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              className="space-y-4"
              noValidate
              onSubmit={(event) => {
                void form.handleSubmit((values) => {
                  mutation.mutate(values);
                })(event);
              }}
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("loginEmailLabel")}</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("loginPasswordLabel")}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {mutation.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {t("loginInvalidCredentials")}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? t("loginSubmitPending") : t("loginSubmit")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
