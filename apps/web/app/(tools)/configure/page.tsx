"use client";

/**
 * Configurator — the three-panel heart of the kit (Task 4.2).
 *
 * Left: scope, search mode, query, and buyer context. Middle: all 10 filters
 * plus pagination and offer view. Right (sticky): live CatalogConfig JSON, the
 * exact `buildSearchArguments` wire payload, a generated standalone code
 * snippet, and actions (run in playground, copy, download). All three panels
 * read and write the same zustand `useConfigStore`; the config is the contract.
 */

import { useEffect } from "react";
import { initConfigFromEnvironment } from "@/lib/config-store";
import { ScopePanel } from "@/components/configurator/scope-panel";
import { FiltersPanel } from "@/components/configurator/filters-panel";
import { OutputPanel } from "@/components/configurator/output-panel";

export default function ConfigurePage() {
  // Hydrate from URL hash → localStorage → default on mount (client only).
  useEffect(() => {
    initConfigFromEnvironment();
  }, []);

  return (
    <main className="mx-auto w-full max-w-[100rem] px-6 pt-6 pb-10">
      <header className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configurator</h1>
        <p className="text-sm text-muted-foreground">
          Build a portable <code className="font-mono">CatalogConfig</code> —
          the single JSON contract that drives the playground, the demo, and your
          exported code. Every change updates the live output on the right.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <ScopePanel />
        </div>
        <div className="min-w-0">
          <FiltersPanel />
        </div>
        <div className="min-w-0">
          <OutputPanel />
        </div>
      </div>
    </main>
  );
}
