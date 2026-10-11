import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
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

// Same floor as the API (`PasswordResetConfirm.new_password`, min_length=8).
const MIN_PASSWORD_LENGTH = 8;

const resetPasswordSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD_LENGTH, strings.resetPasswordTooShort),
    confirmation: z.string(),
  })
  .refine((values) => values.password === values.confirmation, {
    message: strings.resetPasswordMismatch,
    path: ["confirmation"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

async function confirmReset(token: string, values: ResetPasswordValues): Promise<void> {
  const client = createApiClient(apiBaseUrl);
  const { response } = await client.POST("/auth/password-reset/confirm", {
    body: { token, new_password: values.password },
  });
  if (!response.ok) {
    throw new Error(`POST /auth/password-reset/confirm failed with ${String(response.status)}.`);
  }
}

/** The page both e-mails link to: the "forgot password" link (RF03, 30 min) and the invite a
 * new user receives when an admin creates the account (RF05, 24 h). */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmation: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: ResetPasswordValues) => confirmReset(token, values),
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">{t("resetPasswordTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {token === "" && (
            <p role="alert" className="text-sm text-destructive">
              {t("resetPasswordMissingToken")}
            </p>
          )}
          {mutation.isSuccess && (
            <p role="status" className="text-sm">
              {t("resetPasswordDone")}
            </p>
          )}
          {token !== "" && !mutation.isSuccess && (
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
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("resetPasswordNewLabel")}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("resetPasswordConfirmLabel")}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {mutation.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    {t("resetPasswordInvalidLink")}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? t("resetPasswordSubmitPending") : t("resetPasswordSubmit")}
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
