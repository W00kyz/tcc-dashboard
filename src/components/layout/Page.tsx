import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Working pages (boards, maps, registries, reports) use the whole width of the window: capped at
// 5xl/7xl they left a wide empty band on the right of a desktop screen. Only running text
// (privacy notice, not-found message) keeps a readable measure. `wide` is kept as an alias so
// the pages that asked for room keep saying so.
const PAGE_WIDTH = {
  narrow: "max-w-3xl",
  default: "max-w-none",
  wide: "max-w-none",
} as const;

interface PageProps {
  width?: keyof typeof PAGE_WIDTH;
  className?: string;
  children: ReactNode;
}

/** Content column for a signed-in page. Example: `<Page width="wide">…</Page>`. */
export function Page({ width = "default", className, children }: PageProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-6 px-4 py-6 md:px-8 md:py-8",
        PAGE_WIDTH[width],
        className,
      )}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

/** The page's single h1, with optional supporting line and primary actions on the right. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-primary text-2xl leading-tight font-extrabold tracking-[-0.01em] text-balance md:text-[1.75rem]">
          {title}
        </h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

interface SectionProps {
  title: ReactNode;
  titleId?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A titled region inside a page (h2). Pass `titleId` to label the region by its heading. */
export function Section({ title, titleId, actions, className, children }: SectionProps) {
  return (
    <section aria-labelledby={titleId} className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-foreground text-base font-bold">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A white plate holding a page block (table, form, list). Not a card grid. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("bg-card rounded-md border", className)}>{children}</div>;
}
