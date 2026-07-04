import { cn } from "@/lib/utils";

/**
 * Inline GitHub mark. lucide-react (v1) dropped brand icons, so we ship the
 * official Octocat glyph ourselves. currentColor-driven; sized via className.
 */
export function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={cn("size-4", className)}
    >
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

/**
 * The catalog-kit mark: a bracketed "signal" node — three stacked catalog rows
 * feeding one live pulse. Inline SVG, currentColor-driven so it inherits ink,
 * with the accent applied to the pulse dot. No emoji, no raster.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        className="size-6"
      >
        <path
          d="M4 4h4M4 4v16M4 20h4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <line x1="9" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="9" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="9" y1="16" x2="16" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="19.5" cy="12" r="2" fill="var(--lp-accent-strong)" />
      </svg>
      <span className="font-mono text-[0.85rem] font-semibold tracking-tight sm:text-[0.95rem]">
        catalog<span className="text-[var(--lp-accent-strong)]">/</span>kit
      </span>
    </span>
  );
}
