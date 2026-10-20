import { Link } from "react-router-dom";

import { Page, PageHeader } from "@/components/layout/Page";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/useTranslation";

/** Catch-all for unknown addresses (a mistyped URL, an old bookmark). "/" then routes the user
 * to their home or to the login, so this page does not need to know who is signed in. */
export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <Page width="narrow">
      <PageHeader title={t("notFoundTitle")} description={t("notFoundBody")} />
      <Button className="self-start" asChild>
        <Link to="/">{t("notFoundBackHome")}</Link>
      </Button>
    </Page>
  );
}
