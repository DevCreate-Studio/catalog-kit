import { Eyebrow, Section, SectionHeading } from "./section";

const STEPS = [
  { n: "01", title: "Clone", line: "git clone. No account, no keys." },
  { n: "02", title: "Dev", line: "pnpm dev — live search in seconds." },
  { n: "03", title: "Configure", line: "Toggle filters into one CatalogConfig." },
  { n: "04", title: "Export", line: "Copy the config or the generated code." },
  { n: "05", title: "Ship", line: "Deploy to Vercel or Workers." },
] as const;

/** The five-step strip — Clone → Dev → Configure → Export → Ship. */
export function Steps() {
  return (
    <Section>
      <Eyebrow>The path</Eyebrow>
      <SectionHeading>From idea to shipped in five moves.</SectionHeading>

      <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[var(--lp-border-strong)] bg-[var(--lp-border-strong)] sm:grid-cols-3 lg:grid-cols-5">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="group relative flex flex-col gap-3 bg-[var(--lp-panel)] p-5 transition-colors hover:bg-[var(--lp-panel-2)]"
          >
            <span className="font-mono text-2xl font-semibold tracking-tight text-[var(--lp-accent-strong)]">
              {step.n}
            </span>
            <div>
              <p className="text-sm font-semibold">{step.title}</p>
              <p className="mt-1 text-[0.8rem] leading-relaxed text-[var(--lp-muted)]">
                {step.line}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
