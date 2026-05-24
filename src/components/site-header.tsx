"use client";

import { Radio } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Live" },
  { href: "/report", label: "QR form" },
  { href: "/extension", label: "Extension" },
  { href: "/compliance", label: "Compliance" },
  { href: "/privacy", label: "Privacy" },
  { href: "/settings", label: "Settings" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3 lg:px-8">
        <Link
          className="flex max-w-[42vw] shrink-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:max-w-none sm:gap-3"
          href="/"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-700 text-white sm:h-10 sm:w-10">
            <Radio aria-hidden className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="min-w-0">
            <span className="hidden text-xs font-semibold uppercase tracking-wide text-teal-800 sm:block">
              Download Festival operations
            </span>
            <span className="block truncate text-sm font-semibold tracking-normal sm:text-xl">
              KSS Accessibility Live Monitor
            </span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain text-xs [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:justify-end sm:gap-2 sm:overflow-visible sm:text-sm [&::-webkit-scrollbar]:hidden"
        >
          {navItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-md border border-transparent px-2.5 py-1.5 text-center font-medium transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3 sm:py-2 sm:text-left",
                  isActive
                    ? "border-teal-200 bg-teal-50 text-teal-900"
                    : "text-foreground"
                )}
                href={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
