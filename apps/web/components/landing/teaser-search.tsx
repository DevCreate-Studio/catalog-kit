"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, Search, Store } from "lucide-react";
import type { CatalogConfig, CatalogProduct } from "catalog-kit";
import {
  productImage,
  productLink,
  productPrice,
  sellerDomain,
  type ProxyResponse,
} from "@/components/playground/shared";

const SEED_QUERY = "mechanical keyboard";
const LIMIT = 4;

type State =
  | { status: "idle" | "loading" }
  | { status: "done"; products: CatalogProduct[]; latencyMs?: number }
  | { status: "empty" }
  | { status: "error"; message: string };

function buildConfig(query: string): CatalogConfig {
  return {
    version: 1,
    scope: { type: "global" },
    query,
    filters: { available: true },
    pagination: { limit: LIMIT },
  };
}

/**
 * The proof-over-promises moment: a live search against the real Global Catalog
 * through the same server proxy the whole kit uses. Keyless — no credentials.
 * The only client island on the landing page.
 *
 * Zero CLS: the results row reserves four fixed-height card slots at all times,
 * so nothing shifts when results arrive.
 */
export function TeaserSearch() {
  const [query, setQuery] = useState(SEED_QUERY);
  const [state, setState] = useState<State>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: "search", config: buildConfig(trimmed) }),
        signal: ctrl.signal,
      });
      const body = (await res.json()) as ProxyResponse;

      if (!body.ok) {
        const code = body.error.code;
        const message =
          code === "RATE_LIMITED" || code === "PROXY_RATE_LIMITED"
            ? "The keyless tier is rate-limited right now. Wait a moment and try again — or add credentials for higher limits."
            : body.error.message ||
              "Couldn't reach the catalog just now. Try again in a moment.";
        setState({ status: "error", message });
        return;
      }

      const data = body.data as { products?: CatalogProduct[] };
      const products = (data.products ?? []).slice(0, LIMIT);
      if (products.length === 0) {
        setState({ status: "empty" });
        return;
      }
      setState({ status: "done", products, latencyMs: body.meta?.latencyMs });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState({
        status: "error",
        message: "Network hiccup — try again in a moment.",
      });
    }
  }, []);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void run(query);
    },
    [query, run],
  );

  const loading = state.status === "loading";

  return (
    <div className="rounded-2xl border border-[var(--lp-border-strong)] bg-[var(--lp-panel)] p-5 sm:p-7">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-[var(--lp-border-strong)] bg-[var(--lp-bg)] px-3.5 focus-within:border-[var(--lp-accent-strong)] focus-within:ring-2 focus-within:ring-[var(--lp-accent)]/40">
          <Search className="size-4 shrink-0 text-[var(--lp-muted)]" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the Global Catalog…"
            aria-label="Search the Global Catalog"
            className="h-12 w-full bg-transparent font-mono text-sm text-[var(--lp-fg)] outline-none placeholder:text-[var(--lp-muted)]"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--lp-fg)] px-6 text-sm font-semibold text-[var(--lp-bg)] outline-none transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-panel)]"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {/* Results — always four reserved slots' worth of height (no layout shift) */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {state.status === "error" ? (
          <div className="col-span-full flex items-start gap-3 rounded-xl border border-dashed border-[var(--lp-border-strong)] bg-[var(--lp-bg)] p-5 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--lp-accent-strong)]" />
            <p className="text-[var(--lp-muted)]">{state.message}</p>
          </div>
        ) : state.status === "empty" ? (
          <div className="col-span-full rounded-xl border border-dashed border-[var(--lp-border-strong)] bg-[var(--lp-bg)] p-5 text-sm text-[var(--lp-muted)]">
            No products matched. Try a broader query.
          </div>
        ) : state.status === "done" ? (
          state.products.map((p, i) => <TeaserCard key={p.id ?? i} product={p} />)
        ) : state.status === "loading" ? (
          Array.from({ length: LIMIT }).map((_, i) => (
            <TeaserSkeleton key={i} pulse />
          ))
        ) : (
          // Idle: an inviting empty-prompt panel, not stuck-looking skeletons (#24).
          <div className="col-span-full flex min-h-[11rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--lp-border-strong)] bg-[var(--lp-bg)] p-6 text-center">
            <Search className="size-5 text-[var(--lp-accent-strong)]" aria-hidden />
            <p className="text-sm text-[var(--lp-muted)]">
              Press{" "}
              <span className="font-medium text-[var(--lp-fg)]">Search</span> to
              query the live catalog.
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[0.72rem] text-[var(--lp-muted)]">
        <span className="inline-flex size-1.5 rounded-full bg-[var(--lp-accent-strong)]" />
        Live data from the Global Catalog — keyless.
        {state.status === "done" && state.latencyMs != null ? (
          <span className="ml-auto font-mono tabular-nums">
            {state.latencyMs} ms
          </span>
        ) : null}
      </p>
    </div>
  );
}

function TeaserCard({ product }: { product: CatalogProduct }) {
  const image = productImage(product);
  const price = productPrice(product);
  const seller = sellerDomain(product);
  const link = productLink(product);

  const inner = (
    <>
      <div className="aspect-square w-full overflow-hidden bg-[var(--lp-panel-2)]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- hot-linked cross-merchant CDN image (compliance: never re-hosted).
          <img
            src={image.url}
            alt={image.alt}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover/card:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-[0.7rem] text-[var(--lp-muted)]">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p
          className="line-clamp-2 text-[0.8rem] leading-snug font-medium"
          title={product.title}
        >
          {product.title || "Untitled product"}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {price ? (
            <span className="font-mono text-[0.8rem] font-semibold tabular-nums">
              {price}
            </span>
          ) : (
            <span />
          )}
          {link ? (
            <ArrowUpRight className="size-3.5 shrink-0 text-[var(--lp-muted)] transition-colors group-hover/card:text-[var(--lp-accent-strong)]" />
          ) : null}
        </div>
        {seller ? (
          <span
            className="inline-flex items-center gap-1 truncate text-[0.68rem] text-[var(--lp-muted)]"
            title={seller}
          >
            <Store className="size-3 shrink-0" />
            <span className="truncate">{seller}</span>
          </span>
        ) : null}
      </div>
    </>
  );

  const className =
    "group/card flex h-full flex-col overflow-hidden rounded-xl border border-[var(--lp-border)] bg-[var(--lp-bg)] transition-colors hover:border-[var(--lp-accent-strong)]";

  return link ? (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {inner}
    </a>
  ) : (
    <div className={className}>{inner}</div>
  );
}

function TeaserSkeleton({ pulse }: { pulse: boolean }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--lp-border)] bg-[var(--lp-bg)]">
      <div
        className={`aspect-square w-full bg-[var(--lp-panel-2)] ${pulse ? "animate-pulse" : ""}`}
      />
      <div className="flex flex-col gap-2 p-3">
        <div
          className={`h-3 w-full rounded bg-[var(--lp-panel-2)] ${pulse ? "animate-pulse" : ""}`}
        />
        <div
          className={`h-3 w-2/3 rounded bg-[var(--lp-panel-2)] ${pulse ? "animate-pulse" : ""}`}
        />
      </div>
    </div>
  );
}
