import type { ReactNode } from "react";

import { useTranslation } from "@/i18n/useTranslation";

// A route line drawn as the panel's only ornament: the same disc-and-track grammar the
// board uses, so the first screen already speaks the product's language.
const PANEL_STOPS = [1, 2, 3, 4, 5];
const PANEL_DONE = 3;

function PanelRouteLine() {
  return (
    <ol aria-hidden="true" className="flex items-center">
      {PANEL_STOPS.map((stop) => (
        <li key={stop} className="flex items-center">
          <span
            className={
              stop <= PANEL_DONE
                ? "bg-sidebar-primary text-sidebar-primary-foreground flex size-9 items-center justify-center rounded-full text-sm font-bold"
                : stop === PANEL_DONE + 1
                  ? "border-sidebar-primary text-sidebar-primary ring-sidebar-primary/25 flex size-9 items-center justify-center rounded-full border-2 text-sm font-bold ring-4"
                  : "border-sidebar-muted text-sidebar-muted flex size-9 items-center justify-center rounded-full border-2 text-sm font-bold"
            }
          >
            {stop}
          </span>
          {stop < PANEL_STOPS.length && (
            <span
              className={
                stop < PANEL_DONE + 1
                  ? "bg-sidebar-primary h-1 w-10"
                  : "bg-sidebar-muted/50 h-1 w-10"
              }
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function BrandPanel() {
  const { t } = useTranslation();

  return (
    <div className="bg-sidebar text-sidebar-foreground hidden flex-col justify-between p-12 lg:flex">
      <div className="flex items-center gap-3">
        <span className="bg-signal text-signal-foreground rounded-[3px] px-2 py-1 text-base leading-tight font-extrabold">
          PU
        </span>
        <span className="text-sidebar-muted text-sm">{t("appBrandOrg")}</span>
      </div>
      <div className="space-y-8">
        <PanelRouteLine />
        <p className="text-sidebar-accent-foreground max-w-md text-4xl leading-[1.1] font-extrabold tracking-[-0.02em]">
          {t("appBrandName")}
        </p>
      </div>
      <p className="text-sidebar-muted text-xs">{t("loginSubtitle")}</p>
    </div>
  );
}

function MobileBrand() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2.5 lg:hidden">
      <span className="bg-signal text-signal-foreground rounded-[3px] px-1.5 py-0.5 text-sm leading-tight font-extrabold">
        PU
      </span>
      <span className="text-primary text-sm font-bold">{t("appBrandName")}</span>
    </div>
  );
}

interface AuthLayoutProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Full-screen frame for the signed-out pages: brand panel on wide screens, form column. */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <main className="bg-background grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <BrandPanel />
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <MobileBrand />
          <div className="space-y-2">
            <h1 className="text-primary text-[1.75rem] leading-tight font-extrabold tracking-[-0.01em]">
              {title}
            </h1>
            {description && <p className="text-muted-foreground text-sm">{description}</p>}
          </div>
          {children}
          {footer && <div className="border-t pt-6 text-center text-sm">{footer}</div>}
        </div>
      </div>
    </main>
  );
}
