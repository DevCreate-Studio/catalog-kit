import { Eyebrow, Section, SectionHeading } from "./section";
import { TeaserSearch } from "./teaser-search";

/** Wraps the live teaser client island with a heading — proof over promises. */
export function TeaserSection() {
  return (
    <Section className="bg-[var(--lp-panel-2)]">
      <Eyebrow>Proof, not promises</Eyebrow>
      <SectionHeading>Search the real catalog. Right now.</SectionHeading>
      <p className="mt-4 mb-10 max-w-xl text-[var(--lp-muted)]">
        This box hits the same server proxy the kit ships with, against the live
        Global Catalog — no key, no signup. It&apos;s exactly what your app gets.
      </p>
      <TeaserSearch />
    </Section>
  );
}
