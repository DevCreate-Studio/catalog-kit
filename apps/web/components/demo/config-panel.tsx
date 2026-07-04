"use client";

import { ChevronRight, ExternalLink, SlidersHorizontal } from "lucide-react";
import type { CatalogConfig } from "catalog-kit";
import { encodeConfigHash } from "@/lib/config-hash";
import { CopyButton } from "@/components/playground/copy-button";

/**
 * "Powered by this config" collapsible panel. Shows the ACTIVE config JSON live
 * — including after a Similar click (the mutated `like` config) — and deep-links
 * into the configurator and playground with the same config via a `#c=<hash>`.
 *
 * The configurator's `initConfigFromEnvironment()` reads that hash on mount, so
 * "Open in configurator" prefills every panel from the exact config on screen.
 */
export function ConfigPanel({ config }: { config: CatalogConfig }) {
  const json = JSON.stringify(config, null, 2);
  const hash = encodeConfigHash(config);
  const configureHref = `/configure#c=${hash}`;
  const playgroundHref = `/playground#c=${hash}`;

  return (
    <details className="group rounded-xl border bg-muted/30 [&_svg.chev]:open:rotate-90">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium">
        <ChevronRight className="chev size-4 shrink-0 transition-transform" />
        Powered by this config
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          the live CatalogConfig driving this grid
        </span>
      </summary>

      <div className="space-y-3 border-t px-4 pb-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={configureHref}
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            <SlidersHorizontal className="size-3.5" />
            Open in configurator
          </a>
          <a
            href={playgroundHref}
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            <ExternalLink className="size-3.5" />
            Open in playground
          </a>
          <CopyButton value={json} label="Copy config" />
        </div>

        <pre className="max-h-[24rem] overflow-auto rounded-lg border bg-background p-3 text-xs leading-relaxed">
          {json}
        </pre>
      </div>
    </details>
  );
}
