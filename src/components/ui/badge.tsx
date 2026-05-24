import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

const severityClasses: Record<Severity, string> = {
  Critical: "bg-red-100 text-red-900 ring-red-200",
  High: "bg-amber-100 text-amber-950 ring-amber-200",
  Medium: "bg-sky-100 text-sky-950 ring-sky-200",
  Low: "bg-slate-100 text-slate-800 ring-slate-200",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold ring-1",
        severityClasses[severity],
      )}
    >
      {severity}
    </span>
  );
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md bg-muted px-2 text-xs font-medium text-muted-foreground ring-1 ring-border",
        className,
      )}
    >
      {children}
    </span>
  );
}
