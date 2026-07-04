import { FileJson, FileText, FlaskConical, ScrollText, Wrench } from "lucide-react";
import { Eyebrow } from "./section";
import { CopyButton } from "./copy-button";
import { AGENT_PROMPT } from "./constants";

const ARTIFACTS = [
  { icon: FileText, label: "AGENTS.md", note: "single source of truth" },
  { icon: Wrench, label: "Claude Code skill", note: "idea → config → page" },
  { icon: FileJson, label: "JSON Schema", note: "validate without running" },
  { icon: ScrollText, label: "llms.txt", note: "LLM-ingestible docs" },
  { icon: FlaskConical, label: "Offline fixtures", note: "test with no network" },
];

/**
 * Agent-ready — the kit's sharpest differentiator, staged as a feature
 * spotlight rather than a plain section. Breaks out of the shared `Section`
 * shell to run an emphasis band (accent-tinted `--lp-panel-2` + a signal glow
 * and dotted grid echoing the Hero) so it reads as a second, hero-tier moment.
 * The one copy-paste agent prompt is the visual centerpiece; the five shipped
 * artifacts sit beneath it as a supporting rail.
 */
export function AgentReady() {
  return (
    <section className="relative isolate overflow-hidden border-b border-[var(--lp-border)] bg-[var(--lp-panel-2)]">
      {/* Atmosphere: dotted grid + a signal glow bleeding from the top, marking
          this as a hero-tier moment (the Hero uses the same two layers). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--lp-dot)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_75%_55%_at_50%_0%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 size-[42rem] -translate-x-1/2 rounded-full opacity-[0.28] blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--lp-accent) 0%, transparent 62%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 py-24 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <div className="flex justify-center">
            <Eyebrow>Built for agents</Eyebrow>
          </div>
          <h2 className="mt-5 text-balance font-[family-name:var(--font-display)] text-[2.5rem] leading-[1.03] font-normal tracking-[-0.015em] sm:text-[3.5rem]">
            Hand it to Claude and walk away.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[var(--lp-muted)]">
            The repo is a first-class agent workspace — one source of truth, a
            bundled skill, machine-checkable schemas, and recorded fixtures so an
            agent can build and test offline.
          </p>
        </div>

        {/* The centerpiece: an oversized terminal card, ringed in the signal
            accent with a soft glow so the eye lands here first. */}
        <div className="relative mx-auto mt-12 max-w-3xl">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-4 rounded-[1.75rem] bg-[var(--lp-accent)] opacity-[0.10] blur-2xl"
          />
          <figure className="relative overflow-hidden rounded-3xl border border-[var(--lp-accent-strong)]/60 bg-[var(--ink)] text-[var(--paper)] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.55)] ring-1 ring-[var(--lp-accent)]/20 dark:bg-[oklch(0.14_0.014_255)]">
            <figcaption className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-white/20" />
                <span className="size-2.5 rounded-full bg-[var(--lp-accent)]" />
              </span>
              <span className="font-mono text-[0.68rem] tracking-[0.14em] text-white/50 uppercase">
                paste into your agent
              </span>
              <CopyButton
                value={AGENT_PROMPT}
                label="Copy prompt"
                className="border-white/20 text-white/70 hover:border-[var(--lp-accent)] hover:text-white"
              />
            </figcaption>
            <pre className="overflow-x-auto px-6 py-7 sm:px-8 sm:py-9">
              <code className="font-mono text-base leading-relaxed whitespace-pre-wrap text-white/90 sm:text-lg">
                <span
                  aria-hidden
                  className="mr-3 select-none text-[var(--lp-accent)]"
                >
                  $
                </span>
                {AGENT_PROMPT}
              </code>
            </pre>
          </figure>
        </div>

        {/* Supporting rail: the five shipped artifacts, subordinate to the
            prompt above. */}
        <ul className="mx-auto mt-9 flex max-w-3xl flex-wrap justify-center gap-2.5">
          {ARTIFACTS.map((a) => {
            const Icon = a.icon;
            return (
              <li
                key={a.label}
                className="inline-flex items-center gap-2.5 rounded-xl border border-[var(--lp-border-strong)] bg-[var(--lp-panel)] px-3.5 py-2.5"
              >
                <Icon className="size-4 text-[var(--lp-accent-strong)]" />
                <span className="text-sm font-medium">{a.label}</span>
                <span className="hidden text-[0.72rem] text-[var(--lp-muted)] sm:inline">
                  — {a.note}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
