"use client";

/**
 * Demo storefront — the CatalogConfig contract, made visible.
 *
 * Four preset cards (imported statically from `examples/*.config.json`) each
 * load their config and run it through the shared proxy (POST /api/catalog).
 * Results render in a responsive, hot-linked grid. Every card carries a
 * "Similar" button (more-like-this in one click) and a live "Powered by this
 * config" panel deep-links the active config into the configurator/playground.
 *
 * No catalog call originates client-side; the proxy holds credentials and
 * enforces no-store (compliance). No results are cached — Load more paginates.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import type { CatalogConfig, CatalogProduct, SearchResult } from "catalog-kit";
import { ErrorBanner } from "@/components/playground/error-banner";
import { MessageList } from "@/components/playground/message-list";
import { StatusLine } from "@/components/playground/status-line";
import { callProxy, type ProxyError, type ProxyMeta } from "@/components/playground/shared";
import { ConfigPanel } from "@/components/demo/config-panel";
import { PresetSwitcher } from "@/components/demo/preset-switcher";
import { ProductGrid } from "@/components/demo/product-grid";
import { DEMO_PRESETS, type DemoPreset } from "@/components/demo/presets";

/**
 * Build a more-like-this config from a product id: keep the preset's scope,
 * context, filters, view, and pagination; DROP its `query` and `like`; set
 * `like: [{ id }]` (per A6 — one-click more-like-this that respects filters).
 */
function similarConfig(base: CatalogConfig, id: string): CatalogConfig {
  const next = structuredClone(base) as CatalogConfig & {
    query?: unknown;
    like?: unknown;
    name?: string;
  };
  delete next.query;
  next.like = [{ id }];
  next.name = `${base.name ?? "preset"}-similar`;
  return next as CatalogConfig;
}

export default function DemoPage() {
  const [activeConfig, setActiveConfig] = useState<CatalogConfig>(
    DEMO_PRESETS[0].config,
  );
  const [activeSlug, setActiveSlug] = useState<string>(DEMO_PRESETS[0].slug);
  // When the user pivots to a "Similar" search, remember the source product and
  // the preset to return to, so we can show a "back to preset" chip (finding #20).
  const [similarOf, setSimilarOf] = useState<{
    id: string;
    title: string;
    presetSlug: string;
  } | null>(null);

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [messages, setMessages] = useState<unknown[]>([]);
  const [meta, setMeta] = useState<ProxyMeta | null>(null);
  const [error, setError] = useState<ProxyError | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ran, setRan] = useState(false);

  // Guards against a stale in-flight response overwriting a newer run.
  const runId = useRef(0);

  const runSearch = useCallback(
    async (config: CatalogConfig, cursorArg?: string) => {
      const append = Boolean(cursorArg);
      const myRun = ++runId.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }

      const body: Record<string, unknown> = { tool: "search", config };
      if (cursorArg) body.cursor = cursorArg;
      const res = await callProxy(body);

      // Ignore if a newer run started while this was in flight.
      if (myRun !== runId.current) return;

      if (res.ok) {
        const data = res.data as SearchResult;
        const next = (data.products ?? []) as CatalogProduct[];
        setProducts((prev) => (append ? [...prev, ...next] : next));
        setCursor(data.pagination?.cursor);
        setHasNextPage(Boolean(data.pagination?.has_next_page && data.pagination?.cursor));
        setMessages((data.messages ?? []) as unknown[]);
        setMeta(res.meta);
        setError(null);
      } else {
        setError(res.error);
        setMeta(res.meta ?? null);
        if (!append) {
          setProducts([]);
          setCursor(undefined);
          setHasNextPage(false);
          setMessages(res.error.messages ?? []);
        }
      }
      setRan(true);
      setLoading(false);
      setLoadingMore(false);
    },
    [],
  );

  // Run the initial preset once on mount. Deferred to a microtask so the
  // synchronous setState inside runSearch doesn't fire in the effect body
  // (avoids the cascading-render lint rule; this is a genuine data fetch).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void runSearch(DEMO_PRESETS[0].config);
    });
    return () => {
      cancelled = true;
    };
  }, [runSearch]);

  function selectPreset(preset: DemoPreset) {
    setActiveSlug(preset.slug);
    setActiveConfig(preset.config);
    setSimilarOf(null); // a preset selection clears any "similar" pivot
    setProducts([]);
    setRan(false);
    void runSearch(preset.config);
  }

  function onSimilar(id: string, title: string) {
    const next = similarConfig(activeConfig, id);
    // Remember the preset to return to. If we're already in a similar pivot,
    // keep the original preset (activeSlug is "" mid-pivot).
    const presetSlug = similarOf?.presetSlug ?? activeSlug;
    setActiveConfig(next);
    setActiveSlug(""); // no preset card is "active" once we pivot to a similar search
    setSimilarOf({ id, title, presetSlug });
    setProducts([]);
    setRan(false);
    void runSearch(next);
  }

  /** Restore the source preset's original config and re-run it (finding #20). */
  function backToPreset() {
    const preset =
      DEMO_PRESETS.find((p) => p.slug === similarOf?.presetSlug) ??
      DEMO_PRESETS[0];
    selectPreset(preset);
  }

  function onLoadMore() {
    if (cursor) void runSearch(activeConfig, cursor);
  }

  const showEmpty = ran && !loading && !error && products.length === 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 pt-6 pb-10">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Demo storefront</h1>
        <p className="text-sm text-muted-foreground">
          Four storefronts, one contract. Pick a preset — each is a portable
          CatalogConfig running live against the Global Catalog.
        </p>
      </header>

      <div className="mb-6">
        <PresetSwitcher activeSlug={activeSlug} onSelect={selectPreset} />
      </div>

      <div className="mb-6">
        <ConfigPanel config={activeConfig} />
      </div>

      <div className="mb-4 flex items-center gap-3">
        <StatusLine meta={meta} />
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Searching…
          </span>
        ) : null}
        {messages.length > 0 ? (
          <span className="text-xs text-amber-600 dark:text-amber-500">
            {messages.length} message{messages.length === 1 ? "" : "s"} — some
            filters may have been ignored (see the config panel).
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="space-y-3">
          <ErrorBanner error={error} />
          {Array.isArray(error.messages) && error.messages.length > 0 ? (
            <MessageList messages={error.messages} />
          ) : null}
        </div>
      ) : null}

      {similarOf ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">
            Showing products similar to
          </span>
          <span className="font-medium text-foreground">
            {similarOf.title}
          </span>
          <button
            type="button"
            onClick={backToPreset}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary underline-offset-2 outline-none transition-colors hover:bg-primary/10 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
            Back to preset
          </button>
        </div>
      ) : null}

      {loading && products.length === 0 ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : showEmpty ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <p className="text-sm font-medium">No products matched this config.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try another preset, or loosen the filters in the configurator.
          </p>
          {messages.length > 0 ? (
            <div className="mx-auto mt-4 max-w-lg text-left">
              <MessageList messages={messages} />
            </div>
          ) : null}
        </div>
      ) : products.length > 0 ? (
        <ProductGrid
          products={products}
          onSimilar={onSimilar}
          activeSimilarId={similarOf?.id}
          hasNextPage={hasNextPage}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
        />
      ) : null}
    </main>
  );
}
