import { AlertTriangle, CircleCheck, Inbox, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** What a list says when it has nothing to show, with an optional way forward. */
export function EmptyState({ children, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "bg-card text-muted-foreground flex flex-col items-center gap-3 rounded-md border border-dashed px-6 py-10 text-center text-sm",
        className,
      )}
    >
      <Inbox aria-hidden="true" className="text-input size-6" />
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Inline loading line; the spinner is decoration, the text is the message. */
export function LoadingMessage({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      {children}
    </p>
  );
}

/** A failure the user should notice; announced to assistive tech via role="alert". */
export function ErrorMessage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={cn(
        "border-status-late/30 bg-status-late-soft text-status-late flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Confirms a completed action; polite live region, so it does not interrupt. */
export function SuccessMessage({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="border-status-done/30 bg-status-done-soft text-status-done flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
    >
      <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** A single field's validation message, set tight under its control. */
export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-status-late text-sm font-semibold">
      {children}
    </p>
  );
}
