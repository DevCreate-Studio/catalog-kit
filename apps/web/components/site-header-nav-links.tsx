"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TOOL_LINKS = [
  { href: "/configure", label: "Configure" },
  { href: "/playground", label: "Playground" },
  { href: "/demo", label: "Demo" },
] as const;

/**
 * Client island: the Configure/Playground/Demo nav links, with the active
 * route highlighted via `usePathname`. Split out from `SiteHeader` so the
 * header itself can stay a server component.
 */
export function ToolNavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5 text-[11px] font-medium sm:gap-1 sm:text-sm">
      {TOOL_LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname?.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-1.5 py-1.5 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
