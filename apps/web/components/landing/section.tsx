import { cn } from "@/lib/utils";

/** A consistent section shell: max width, generous vertical rhythm, hairline divider. */
export function Section({
  children,
  className,
  id,
  divider = true,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  divider?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        "px-6 py-20 sm:py-24",
        divider && "border-b border-[var(--lp-border)]",
        className,
      )}
    >
      <div className="mx-auto max-w-5xl">{children}</div>
    </section>
  );
}

/** A small mono eyebrow label with an accent tick — the section index marker. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[0.72rem] font-medium tracking-[0.14em] text-[var(--lp-muted)] uppercase">
      <span className="h-px w-6 bg-[var(--lp-accent-strong)]" aria-hidden />
      {children}
    </span>
  );
}

/** Section heading — sans, tight tracking, balanced. */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-4 text-balance font-[family-name:var(--font-display)] text-[2.1rem] leading-[1.05] font-normal tracking-[-0.01em] sm:text-[2.75rem]">
      {children}
    </h2>
  );
}
