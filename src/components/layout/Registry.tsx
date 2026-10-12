import type { ReactNode } from "react";

import { EmptyState } from "@/components/layout/StateMessages";
import { useTranslation } from "@/i18n/useTranslation";
import { cn } from "@/lib/utils";

interface RegistryLayoutProps {
  list: ReactNode;
  form: ReactNode;
  formTitle?: ReactNode;
}

/**
 * Registry pages (Cadastros): the records are the page, the "new record" form rides in a
 * side panel on wide screens and drops below the list on a phone.
 */
export function RegistryLayout({ list, form, formTitle }: RegistryLayoutProps) {
  const { t } = useTranslation();

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">{list}</div>
      <section
        aria-labelledby="registry-form-title"
        className="bg-card rounded-md border lg:sticky lg:top-20"
      >
        <h2
          id="registry-form-title"
          className="text-primary border-b px-4 py-3 text-base font-bold"
        >
          {formTitle ?? t("registryFormTitleNew")}
        </h2>
        <div className="p-4">{form}</div>
      </section>
    </div>
  );
}

interface RegistryListProps<Item> {
  items: Item[] | undefined;
  getKey: (item: Item) => string;
  renderItem: (item: Item) => ReactNode;
  empty?: ReactNode;
  className?: string;
}

/** The records of a registry as one plate of rows, with a count and an empty state. */
export function RegistryList<Item>({
  items,
  getKey,
  renderItem,
  empty,
  className,
}: RegistryListProps<Item>) {
  const { t } = useTranslation();
  if (items === undefined) {
    return null;
  }
  if (items.length === 0) {
    return <EmptyState>{empty ?? t("registryListEmpty")}</EmptyState>;
  }

  return (
    <div className={cn("bg-card rounded-md border", className)}>
      <p className="text-muted-foreground border-b px-4 py-2.5 text-xs font-semibold">
        {items.length === 1
          ? t("registryCountOne")
          : t("registryCount").replace("{n}", String(items.length))}
      </p>
      <ul className="divide-y">
        {items.map((item) => (
          <li key={getKey(item)} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            {renderItem(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stacks registry form fields with the shared rhythm. */
export function FormStack({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

/** One labelled field: label, control, optional hint, in the shared spacing. */
export function Field({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}>{children}</div>;
}
