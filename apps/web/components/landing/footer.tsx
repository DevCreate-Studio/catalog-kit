import Link from "next/link";
import { Logo, GithubMark } from "./logo";
import {
  DOCS,
  GITHUB_URL,
  AUTHOR_NAME,
  AUTHOR_URL,
  STUDIO_NAME,
  STUDIO_URL,
} from "./constants";

const DOC_LINKS = [
  { href: DOCS.gettingStarted, label: "Getting started" },
  { href: DOCS.configuration, label: "Configuration" },
  { href: DOCS.apiReference, label: "API reference" },
  { href: DOCS.recipes, label: "Recipes" },
] as const;

const PRODUCT_LINKS = [
  { href: "/configure", label: "Configurator" },
  { href: "/playground", label: "Playground" },
  { href: "/demo", label: "Demo" },
] as const;

export function Footer() {
  return (
    <footer className="px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo className="text-[var(--lp-fg)]" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--lp-muted)]">
              An MIT-licensed starter kit for the Shopify Global Catalog. Clone
              to live cross-merchant search in two minutes.
            </p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[var(--lp-border-strong)] px-3 py-2 text-sm font-medium outline-none transition-colors hover:border-[var(--lp-accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
            >
              <GithubMark className="size-4" />
              Star on GitHub
            </a>
          </div>

          <nav aria-label="Product">
            <p className="font-mono text-[0.7rem] tracking-wide text-[var(--lp-muted)] uppercase">
              Explore
            </p>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-[var(--lp-muted)] outline-none transition-colors hover:text-[var(--lp-fg)] focus-visible:text-[var(--lp-fg)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Documentation">
            <p className="font-mono text-[0.7rem] tracking-wide text-[var(--lp-muted)] uppercase">
              Docs
            </p>
            <ul className="mt-4 space-y-2.5">
              {DOC_LINKS.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--lp-muted)] outline-none transition-colors hover:text-[var(--lp-fg)] focus-visible:text-[var(--lp-fg)]"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-[var(--lp-border)] pt-6 text-[0.78rem] text-[var(--lp-muted)] sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p>
              MIT ·{" "}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:text-[var(--lp-fg)] hover:underline"
              >
                GitHub
              </a>
            </p>
            <p>
              Created by{" "}
              <a
                href={AUTHOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--lp-fg)] underline-offset-4 hover:text-[var(--lp-accent-strong)] hover:underline"
              >
                {AUTHOR_NAME}
              </a>{" "}
              ·{" "}
              <a
                href={STUDIO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--lp-fg)] underline-offset-4 hover:text-[var(--lp-accent-strong)] hover:underline"
              >
                {STUDIO_NAME}
              </a>
            </p>
          </div>
          <p className="max-w-md sm:text-right">
            Not affiliated with Shopify. Built on the public UCP Catalog API.
          </p>
        </div>
      </div>
    </footer>
  );
}
