import Link from "next/link";
import { Logo, GithubMark } from "@/components/landing/logo";
import { GITHUB_URL } from "@/components/landing/constants";
import { ToolNavLinks } from "@/components/site-header-nav-links";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Shared sticky header for the tool pages (/configure, /playground, /demo).
 *
 * Uses the neutral shadcn palette (not the landing's chartreuse `[data-landing]`
 * theme) — the `Logo` component's accent dot reads `--lp-accent-strong`, which
 * is only defined under `[data-landing]`, so we override it locally to a
 * neutral token here rather than pulling in the landing theme.
 */
export function SiteHeader() {
  return (
    <header
      style={{ ["--lp-accent-strong" as string]: "var(--primary)" }}
      className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-[100rem] items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6">
        <Link
          href="/"
          aria-label="catalog-kit home"
          className="flex shrink-0 items-center gap-2 rounded-md text-foreground outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo />
        </Link>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
          <ToolNavLinks />
          <ThemeToggle className="border-border text-foreground hover:bg-accent focus-visible:ring-ring" />
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border p-1.5 text-xs font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:ml-1 sm:px-3 sm:py-1.5 sm:text-sm"
          >
            <GithubMark className="size-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
}
