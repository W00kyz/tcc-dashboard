import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { apiBaseUrl, createApiClient } from "@/api/client";
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

const forgotPasswordSchema = z.object({
  email: z.string().email(strings.loginEmailInvalid),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

async function requestResetLink(values: ForgotPasswordValues): Promise<void> {
  const client = createApiClient(apiBaseUrl);
  const { response } = await client.POST("/auth/password-reset/request", { body: values });
  // 202 whether or not the e-mail exists — the API never reveals who is registered.
  if (!response.ok) {
    throw new Error(`POST /auth/password-reset/request failed with ${String(response.status)}.`);
  }
}

/** RF03: asks the API to e-mail a reset link. The link lands on `/redefinir-senha`. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const mutation = useMutation({ mutationFn: requestResetLink });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">{t("forgotPasswordTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("forgotPasswordIntro")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {mutation.isSuccess ? (
            <p role="status" className="text-sm">
              {t("forgotPasswordSent")}
            </p>
          ) : (
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
                {mutation.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    {t("forgotPasswordError")}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending
                    ? t("forgotPasswordSubmitPending")
                    : t("forgotPasswordSubmit")}
                </Button>
              </form>
            </Form>
          )}
          <Link className="block text-center text-sm underline" to="/entrar">
            {t("passwordBackToLogin")}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
