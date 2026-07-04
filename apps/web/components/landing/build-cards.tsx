import Link from "next/link";
import {
  ArrowUpRight,
  Gift,
  Images,
  Scale,
  Store,
  type LucideIcon,
} from "lucide-react";
import { Eyebrow, Section, SectionHeading } from "./section";

interface BuildCard {
  title: string;
  line: string;
  badge: string;
  icon: LucideIcon;
}

/** Mirrors the four demo presets — each card links into the live /demo. */
const CARDS: BuildCard[] = [
  {
    title: "Gift finder",
    line: "Well-reviewed, in-budget ideas driven by buyer intent.",
    badge: "buyer intent",
    icon: Gift,
  },
  {
    title: "Comparison shopper",
    line: "One product across many sellers, ranked as offers.",
    badge: "offer view",
    icon: Scale,
  },
  {
    title: "Niche marketplace",
    line: "A storefront scoped to a single taxonomy branch.",
    badge: "category-scoped",
    icon: Store,
  },
  {
    title: "Dupe finder",
    line: "Visually similar products from one reference image.",
    badge: "image search",
    icon: Images,
  },
];

/** "What you can build" — four preset-backed cards, all linking /demo. */
export function BuildCards() {
  return (
    <Section>
      <Eyebrow>What you can build</Eyebrow>
      <SectionHeading>Four apps, shipped as presets.</SectionHeading>
      <p className="mt-4 max-w-xl text-[var(--lp-muted)]">
        Each is a real, running config in the demo. Open one, then open it in
        the configurator to see exactly which toggles produced it.
      </p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              href="/demo"
              className="group relative flex flex-col gap-4 rounded-2xl border border-[var(--lp-border-strong)] bg-[var(--lp-panel)] p-6 outline-none transition-all hover:-translate-y-0.5 hover:border-[var(--lp-accent-strong)] focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-bg)]"
            >
              <div className="flex items-start justify-between">
                <span className="inline-flex size-11 items-center justify-center rounded-xl border border-[var(--lp-border-strong)] bg-[var(--lp-bg)] text-[var(--lp-fg)] transition-colors group-hover:border-[var(--lp-accent-strong)] group-hover:text-[var(--lp-accent-strong)]">
                  <Icon className="size-5" />
                </span>
                <ArrowUpRight className="size-5 text-[var(--lp-muted)] transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--lp-accent-strong)]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {card.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--lp-muted)]">
                  {card.line}
                </p>
              </div>
              <span className="mt-1 inline-flex w-fit items-center rounded-full border border-[var(--lp-border-strong)] bg-[var(--lp-bg)] px-2.5 py-1 font-mono text-[0.68rem] tracking-tight text-[var(--lp-accent-fg)]">
                {card.badge}
              </span>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
