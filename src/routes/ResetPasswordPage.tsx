import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { apiBaseUrl, createApiClient } from "@/api/client";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { ErrorMessage, SuccessMessage } from "@/components/layout/StateMessages";
import { Button } from "@/components/ui/button";
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
    <AuthLayout
      title={t("resetPasswordTitle")}
      footer={
        <Link className="text-primary font-semibold underline" to="/entrar">
          {t("passwordBackToLogin")}
        </Link>
      }
    >
      {token === "" && <ErrorMessage>{t("resetPasswordMissingToken")}</ErrorMessage>}
      {mutation.isSuccess && <SuccessMessage>{t("resetPasswordDone")}</SuccessMessage>}
      {token !== "" && !mutation.isSuccess && (
        <Form {...form}>
          <form
            className="space-y-5"
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
                    <Input
                      type="password"
                      autoComplete="new-password"
                      className="h-10"
                      {...field}
                    />
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
                    <Input
                      type="password"
                      autoComplete="new-password"
                      className="h-10"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {mutation.isError && <ErrorMessage>{t("resetPasswordInvalidLink")}</ErrorMessage>}
            <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? t("resetPasswordSubmitPending") : t("resetPasswordSubmit")}
            </Button>
          </form>
        </Form>
      )}
    </AuthLayout>
  );
}
