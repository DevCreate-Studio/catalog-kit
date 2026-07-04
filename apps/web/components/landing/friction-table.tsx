import { Check, X } from "lucide-react";
import { Eyebrow, Section, SectionHeading } from "./section";

interface Row {
  topic: string;
  without: string;
  with: string;
}

const ROWS: Row[] = [
  {
    topic: "JSON-RPC & agent profile",
    without: "Hand-roll tools/call envelopes and host a UCP agent profile.",
    with: "Typed client injects it; the app serves its own profile route.",
  },
  {
    topic: "Auth tiers",
    without: "Wire up client-credentials JWTs and refresh them yourself.",
    with: "Anonymous works out of the box; token tier is one env var.",
  },
  {
    topic: "Filter shapes & quirks",
    without: "Discover minor-unit prices and GID-string categories by trial.",
    with: "Lenient zod schemas encode every probed quirk for you.",
  },
  {
    topic: "Retry, backoff & rate limits",
    without: "Build your own 429 backoff, jitter, and timeout logic.",
    with: "Transport retries with jitter and a 12s timeout, baked in.",
  },
  {
    topic: "Image search encoding",
    without: "Base64-encode reference images to the exact accepted shape.",
    with: "Pass an image URL; the client fetches and encodes it.",
  },
];

/** "Friction deleted" — an honest without/with comparison table. */
export function FrictionTable() {
  return (
    <Section className="bg-[var(--lp-panel-2)]">
      <Eyebrow>Friction deleted</Eyebrow>
      <SectionHeading>The yak-shave, already shaved.</SectionHeading>
      <p className="mt-4 max-w-xl text-[var(--lp-muted)]">
        Everything between the UCP spec and your first product — handled, so you
        start at the interesting part.
      </p>

      {/*
        One grid for the whole table so the 1px gaps render as uniform, aligned
        rules everywhere (finding: broken/partial vertical borders). The
        background shows through the `gap-px`, so every cell paints its own
        `bg-[var(--lp-panel)]` over it. Each logical row is a `sm:contents`
        wrapper: at `sm` its three cells become direct grid items of this single
        grid (so vertical dividers line up top-to-bottom); on mobile the wrapper
        is a normal bordered block and the cells stack full-width with no
        vertical rules.
      */}
      <div className="mt-12 overflow-hidden rounded-2xl border border-[var(--lp-border-strong)] bg-[var(--lp-border)] sm:grid sm:grid-cols-[1fr_1.4fr_1.4fr] sm:gap-px">
        {/* Header (desktop only) */}
        <div className="hidden bg-[var(--lp-panel)] px-5 py-3 font-mono text-[0.7rem] tracking-wide text-[var(--lp-muted)] uppercase sm:block">
          &nbsp;
        </div>
        <div className="hidden bg-[var(--lp-panel)] px-5 py-3 font-mono text-[0.7rem] tracking-wide text-[var(--lp-muted)] uppercase sm:block">
          Without the kit
        </div>
        <div className="hidden bg-[var(--lp-panel)] px-5 py-3 font-mono text-[0.7rem] tracking-wide text-[var(--lp-accent-fg)] uppercase sm:block">
          With the kit
        </div>

        {ROWS.map((row, i) => (
          <div
            key={row.topic}
            className={`bg-[var(--lp-panel)] sm:contents ${
              i > 0 ? "block border-t border-[var(--lp-border)] sm:border-t-0" : ""
            }`}
          >
            <div className="bg-[var(--lp-panel)] px-5 pt-5 pb-2 text-sm font-semibold sm:py-5">
              {row.topic}
            </div>
            <div className="flex items-start gap-2.5 bg-[var(--lp-panel)] px-5 pb-2 text-sm text-[var(--lp-muted)] sm:py-5">
              <X className="mt-0.5 size-4 shrink-0 opacity-50" aria-hidden />
              <span>{row.without}</span>
            </div>
            <div className="flex items-start gap-2.5 bg-[var(--lp-panel)] px-5 pt-2 pb-5 text-sm sm:bg-[var(--lp-bg)]/40 sm:py-5">
              <Check
                className="mt-0.5 size-4 shrink-0 text-[var(--lp-accent-strong)]"
                aria-hidden
              />
              <span>{row.with}</span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
