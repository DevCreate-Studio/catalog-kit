import Link from "next/link";
import { Logo, GithubMark } from "./logo";
import { GITHUB_URL } from "./constants";
import { ThemeToggle } from "@/components/theme-toggle";

/** Slim sticky top nav for the landing page. */
export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--lp-border)] bg-[var(--lp-bg)]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-3.5 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="shrink-0 text-[var(--lp-fg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
          aria-label="catalog-kit home"
        >
          <Logo />
        </Link>
        <nav className="flex shrink-0 items-center gap-0.5 text-[11px] sm:gap-1 sm:text-sm">
          <Link
            href="/configure"
            className="rounded-lg px-1.5 py-1.5 font-medium whitespace-nowrap text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-fg)] sm:px-3"
          >
            Configure
          </Link>
          <Link
            href="/playground"
            className="rounded-lg px-1.5 py-1.5 font-medium whitespace-nowrap text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-fg)] sm:px-3"
          >
            Playground
          </Link>
          <Link
            href="/demo"
            className="rounded-lg px-1.5 py-1.5 font-medium whitespace-nowrap text-[var(--lp-muted)] transition-colors hover:text-[var(--lp-fg)] sm:px-3"
          >
            Demo
          </Link>
          <ThemeToggle className="border-[var(--lp-border-strong)] text-[var(--lp-fg)] hover:border-[var(--lp-accent-strong)] focus-visible:ring-[var(--lp-accent)]" />
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--lp-border-strong)] p-1.5 font-medium outline-none transition-colors hover:border-[var(--lp-accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] sm:ml-1 sm:gap-2 sm:px-3 sm:py-1.5"
          >
            <GithubMark className="size-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
