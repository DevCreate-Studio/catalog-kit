import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CommandBlock } from "./command-block";
import { GithubMark } from "./logo";
import { CLONE_COMMAND, GITHUB_URL } from "./constants";

/**
 * Hero — the front door. Headline built on the core claim, a keyless/MIT/UCP
 * eyebrow, the copyable clone command, two CTAs, and the honest small print.
 * Static server component; the only JS is the clone block's copy button.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--lp-border)]">
      {/* Atmosphere: dotted grid + a soft signal glow bleeding from top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--lp-dot)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] size-[36rem] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--lp-accent) 0%, transparent 65%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-[var(--lp-border-strong)] bg-[var(--lp-panel)] px-3.5 py-1.5 text-[0.72rem] font-medium tracking-wide">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--lp-accent-strong)] opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-[var(--lp-accent-strong)]" />
          </span>
          <span className="text-[var(--lp-muted)]">
            No API key · MIT licensed · UCP-native
          </span>
        </div>

        <h1 className="max-w-3xl text-balance font-[family-name:var(--font-display)] text-[3rem] leading-[1.02] font-normal tracking-[-0.01em] sm:text-[4.5rem]">
          The entire Shopify catalog,
          <br className="hidden sm:block" /> in your app, in{" "}
          <span className="relative whitespace-nowrap font-mono text-[0.82em] font-semibold text-[var(--lp-accent-strong)]">
            2 minutes
            <svg
              aria-hidden
              viewBox="0 0 260 12"
              preserveAspectRatio="none"
              className="absolute -bottom-2 left-0 h-2.5 w-full text-[var(--lp-accent)]"
            >
              <path
                d="M2 8 C 60 2, 120 2, 180 6 S 250 9, 258 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>
          .
        </h1>

        <p className="mt-8 max-w-xl text-lg leading-relaxed text-[var(--lp-muted)]">
          Clone, run <span className="font-mono text-[var(--lp-fg)]">pnpm dev</span>,
          and get live cross-merchant product search — no API key, no yak-shaving
          the UCP spec. One <span className="font-mono text-[var(--lp-fg)]">CatalogConfig</span>{" "}
          drives the configurator, playground, demo, and the code you ship.
        </p>

        <div className="mt-9 max-w-xl">
          <CommandBlock command={CLONE_COMMAND} copyLabel="Copy" />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/configure"
            className="group inline-flex items-center gap-2 rounded-xl bg-[var(--lp-fg)] px-5 py-3 text-sm font-semibold text-[var(--lp-bg)] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)]"
          >
            Open the configurator
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--lp-border-strong)] bg-[var(--lp-panel)] px-5 py-3 text-sm font-semibold outline-none transition-colors hover:border-[var(--lp-accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)]"
          >
            <GithubMark className="size-4" />
            GitHub
          </a>
        </div>

        <p className="mt-6 text-[0.8rem] text-[var(--lp-muted)]">
          Keyless by default — add credentials only for higher rate limits.
        </p>
      </div>
    </section>
  );
}
