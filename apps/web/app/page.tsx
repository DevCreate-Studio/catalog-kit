import type { Metadata } from "next";
import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { TeaserSection } from "@/components/landing/teaser-section";
import { Steps } from "@/components/landing/steps";
import { BuildCards } from "@/components/landing/build-cards";
import { FrictionTable } from "@/components/landing/friction-table";
import { AgentReady } from "@/components/landing/agent-ready";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  // `absolute` bypasses the layout's "%s · catalog-kit" template for the landing.
  title: { absolute: "catalog-kit — the entire Shopify catalog, in your app, in 2 minutes" },
  description:
    "MIT-licensed, agent-ready starter kit for the Shopify Global Catalog (UCP). Clone to live cross-merchant product search in ~2 minutes — no API key.",
};

/**
 * Landing page. Everything is a static server component except the live teaser
 * search, which is the single client island (see teaser-search.tsx). The
 * `data-landing` wrapper scopes the "terminal-luxe" palette (see globals.css)
 * so the app's neutral shadcn tokens are untouched elsewhere.
 */
export default function Home() {
  return (
    <div
      data-landing
      className="flex flex-1 flex-col bg-[var(--lp-bg)] text-[var(--lp-fg)]"
    >
      <Nav />
      <main className="flex-1">
        <Hero />
        <AgentReady />
        <TeaserSection />
        <Steps />
        <BuildCards />
        <FrictionTable />
      </main>
      <Footer />
    </div>
  );
}
