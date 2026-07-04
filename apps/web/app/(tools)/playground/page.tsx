"use client";

/**
 * Playground — exercise all three catalog tools against the server proxy.
 *
 * Tool switcher (Search | Lookup | Get product) across the top. Every tool posts
 * to POST /api/catalog with `{tool, config?|args?, cursor?}` and renders the
 * `{ok, data, meta}` / `{ok:false, error}` envelope. No catalog call originates
 * client-side — the proxy holds credentials and enforces no-store (compliance).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { decodeConfigHash } from "@/lib/config-hash";
import type {
  CatalogProduct,
  SearchResult,
  LookupResult,
  GetProductResult,
} from "catalog-kit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SAMPLE_CONFIGS } from "@/lib/sample-configs";
import {
  ConfigEditor,
  validateConfigText,
  type ConfigValidation,
} from "@/components/playground/config-editor";
import { ResponseViewer } from "@/components/playground/response-viewer";
import { Inspector, type SelectedRow } from "@/components/playground/inspector";
import { ErrorBanner } from "@/components/playground/error-banner";
import { StatusLine } from "@/components/playground/status-line";
import { callProxy, type ProxyError, type ProxyMeta, type Tool } from "@/components/playground/shared";

const DEFAULT_CONFIG = JSON.stringify(SAMPLE_CONFIGS[0].config, null, 2);

/**
 * Read a `#c=<base64url>` config hash on mount (set by the configurator's
 * "Run in playground" button) and return its pretty-printed JSON, or the
 * default sample config. Invalid hashes are ignored.
 */
function initialConfigText(): string {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  const hash = window.location.hash;
  const prefix = "#c=";
  if (!hash.startsWith(prefix)) return DEFAULT_CONFIG;
  const config = decodeConfigHash(hash.slice(prefix.length));
  return config ? JSON.stringify(config, null, 2) : DEFAULT_CONFIG;
}

export default function PlaygroundPage() {
  const [tool, setTool] = useState<Tool>("search");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <main className="mx-auto w-full max-w-7xl px-6 pt-6 pb-10">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
        <p className="text-sm text-muted-foreground">
          Send raw configs and identifiers through the catalog proxy and inspect
          the response — products, messages, and the exact request.
        </p>
      </header>

      <Tabs value={tool} onValueChange={(v) => setTool(v as Tool)} className="mb-6">
        <TabsList>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="lookup">Lookup</TabsTrigger>
          <TabsTrigger value="get_product">Get product</TabsTrigger>
        </TabsList>
      </Tabs>

      {tool === "search" ? (
        <SearchTool origin={origin} inspectorHook={setTool} />
      ) : tool === "lookup" ? (
        <LookupTool origin={origin} setTool={setTool} />
      ) : (
        <GetProductTool origin={origin} />
      )}
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Cross-tool prefill: the Search/Lookup tools need to hand a product id to the
 * Get-product inspector when the user clicks "Inspect". We lift that state into
 * a module-level store the GetProductTool reads on mount. Simple and sufficient
 * for a single-page playground.
 * ────────────────────────────────────────────────────────────────────────── */
let pendingInspectId: string | null = null;
function setPendingInspect(id: string) {
  pendingInspectId = id;
}

/* ── Search tool ─────────────────────────────────────────────────────────── */

function SearchTool({
  origin,
  inspectorHook,
}: {
  origin: string;
  inspectorHook: (t: Tool) => void;
}) {
  const [text, setText] = useState(initialConfigText);
  const validation: ConfigValidation = useMemo(() => validateConfigText(text), [text]);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [raw, setRaw] = useState<unknown>(null);
  const [messages, setMessages] = useState<unknown[]>([]);
  const [meta, setMeta] = useState<ProxyMeta | null>(null);
  const [error, setError] = useState<ProxyError | null>(null);
  const [lastBody, setLastBody] = useState<unknown>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [ran, setRan] = useState(false);

  // Arriving with a `#c=` hash (configurator/demo "Open in playground") means the
  // user already chose to run this config — do it for them. Ref-guarded so React
  // StrictMode's double-mount in dev doesn't fire two searches.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (window.location.hash.startsWith("#c=") && validation.ok) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, []);

  async function run(append = false) {
    if (!validation.ok) return;
    const config = JSON.parse(text);
    const body: Record<string, unknown> = { tool: "search", config };
    if (append && cursor) body.cursor = cursor;
    setLastBody(body);
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    const res = await callProxy(body);
    if (res.ok) {
      const data = res.data as SearchResult;
      const next = (data.products ?? []) as CatalogProduct[];
      setProducts((prev) => (append ? [...prev, ...next] : next));
      setRaw(data);
      setMessages((data.messages ?? []) as unknown[]);
      setMeta(res.meta);
      setCursor(data.pagination?.cursor);
      setRan(true);
    } else {
      setError(res.error);
      setMeta(res.meta ?? null);
      if (!append) {
        setProducts([]);
        setRaw(res.error);
        // Preserve any messages the failed run carried (finding #16) so the
        // Messages tab still explains ignored filters on error, like demo does.
        setMessages(res.error.messages ?? []);
        setRan(true);
      }
    }
    setLoading(false);
    setLoadingMore(false);
  }

  function moreLikeThis(id: string) {
    // Swap the current config's `like` to this id, keep query if present, re-run.
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(text);
    } catch {
      return;
    }
    // `like` is always an array of entries on the wire; keep query if present.
    config.like = [{ id }];
    const nextText = JSON.stringify(config, null, 2);
    setText(nextText);
    // Re-run against the freshly built config (don't wait for state/memo).
    void (async () => {
      setLoading(true);
      setError(null);
      const body = { tool: "search", config };
      setLastBody(body);
      const res = await callProxy(body);
      if (res.ok) {
        const data = res.data as SearchResult;
        setProducts((data.products ?? []) as CatalogProduct[]);
        setRaw(data);
        setMessages((data.messages ?? []) as unknown[]);
        setMeta(res.meta);
        setCursor(data.pagination?.cursor);
        setRan(true);
      } else {
        setError(res.error);
        setMeta(res.meta ?? null);
        // Preserve messages the failed run carried (finding #16).
        setMessages(res.error.messages ?? []);
      }
      setLoading(false);
    })();
  }

  function inspect(id: string) {
    setPendingInspect(id);
    inspectorHook("get_product");
  }

  const hasNextPage = Boolean((raw as SearchResult | null)?.pagination?.has_next_page && cursor);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4">
        <ConfigEditor value={text} onChange={setText} validation={validation} />
        <Button type="button" onClick={() => run(false)} disabled={!validation.ok || loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run
        </Button>
      </div>

      <div className="min-w-0 space-y-4">
        {error ? <ErrorBanner error={error} /> : null}
        <StatusLine meta={meta} />
        {ran ? (
          <ResponseViewer
            products={products}
            raw={raw}
            messages={messages}
            requestBody={lastBody}
            origin={origin}
            hasNextPage={hasNextPage}
            loadingMore={loadingMore}
            onLoadMore={() => run(true)}
            onInspect={inspect}
            onMoreLikeThis={moreLikeThis}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Load a sample or edit the config, then Run.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Lookup tool ─────────────────────────────────────────────────────────── */

function LookupTool({ origin, setTool }: { origin: string; setTool: (t: Tool) => void }) {
  const [idsText, setIdsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [raw, setRaw] = useState<unknown>(null);
  const [messages, setMessages] = useState<unknown[]>([]);
  const [meta, setMeta] = useState<ProxyMeta | null>(null);
  const [error, setError] = useState<ProxyError | null>(null);
  const [lastBody, setLastBody] = useState<unknown>(null);
  const [ran, setRan] = useState(false);

  const ids = useMemo(
    () => idsText.split("\n").map((s) => s.trim()).filter(Boolean),
    [idsText],
  );
  const tooMany = ids.length > 50;

  async function run() {
    if (ids.length === 0 || tooMany) return;
    const body = { tool: "lookup", args: { ids } };
    setLastBody(body);
    setLoading(true);
    setError(null);
    const res = await callProxy(body);
    if (res.ok) {
      const data = res.data as LookupResult;
      setProducts((data.products ?? []) as CatalogProduct[]);
      setRaw(data);
      setMessages((data.messages ?? []) as unknown[]);
      setMeta(res.meta);
    } else {
      setError(res.error);
      setMeta(res.meta ?? null);
      setProducts([]);
      setRaw(res.error);
      // Preserve messages the failed run carried (finding #16).
      setMessages(res.error.messages ?? []);
    }
    setRan(true);
    setLoading(false);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="lookup-ids">
            Identifiers — one per line (UPID, variant GID, or product URL), max 50
          </Label>
          <Textarea
            id="lookup-ids"
            value={idsText}
            onChange={(e) => setIdsText(e.target.value)}
            spellCheck={false}
            placeholder={"gid://shopify/p/…\ngid://shopify/ProductVariant/…\nhttps://shop.example.com/products/…"}
            className="min-h-[16rem] font-mono text-xs"
          />
          <p className={`text-xs ${tooMany ? "text-destructive" : "text-muted-foreground"}`}>
            {ids.length} identifier{ids.length === 1 ? "" : "s"}
            {tooMany ? " — over the 50 limit" : ""}
          </p>
        </div>
        <Button type="button" onClick={run} disabled={ids.length === 0 || tooMany || loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run
        </Button>
      </div>

      <div className="min-w-0 space-y-4">
        {error ? <ErrorBanner error={error} /> : null}
        <StatusLine meta={meta} />
        {ran ? (
          <ResponseViewer
            products={products}
            raw={raw}
            messages={messages}
            requestBody={lastBody}
            origin={origin}
            onInspect={(id) => {
              setPendingInspect(id);
              setTool("get_product");
            }}
            onMoreLikeThis={() => {
              /* more-like-this is a search concept; no-op for lookup results */
            }}
            emptyLabel="No products matched those identifiers."
          />
        ) : (
          <p className="text-sm text-muted-foreground">Paste identifiers and Run.</p>
        )}
      </div>
    </div>
  );
}

/* ── Get product tool ────────────────────────────────────────────────────── */

function GetProductTool({ origin }: { origin: string }) {
  const [id, setId] = useState(() => {
    const pending = pendingInspectId;
    pendingInspectId = null;
    return pending ?? "";
  });
  const [selected, setSelected] = useState<SelectedRow[]>([]);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [messages, setMessages] = useState<unknown[]>([]);
  const [meta, setMeta] = useState<ProxyMeta | null>(null);
  const [error, setError] = useState<ProxyError | null>(null);
  const [lastBody, setLastBody] = useState<unknown>(null);

  async function run() {
    if (!id.trim()) return;
    const args: Record<string, unknown> = { id: id.trim() };
    const cleanSelected = selected.filter((r) => r.name.trim() && r.value.trim());
    if (cleanSelected.length > 0) args.selected = cleanSelected;
    const cleanPrefs = preferences.map((p) => p.trim()).filter(Boolean);
    if (cleanPrefs.length > 0) args.preferences = cleanPrefs;

    const body = { tool: "get_product", args };
    setLastBody(body);
    setLoading(true);
    setError(null);
    const res = await callProxy(body);
    if (res.ok) {
      const data = res.data as GetProductResult;
      setProduct((data.product ?? null) as CatalogProduct | null);
      setRaw(data);
      setMessages((data.messages ?? []) as unknown[]);
      setMeta(res.meta);
    } else {
      setError(res.error);
      setMeta(res.meta ?? null);
      setProduct(null);
      setRaw(res.error);
      // Preserve messages the failed run carried (finding #16).
      setMessages(res.error.messages ?? []);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner error={error} /> : null}
      <StatusLine meta={meta} />
      <Inspector
        id={id}
        onIdChange={setId}
        selected={selected}
        onSelectedChange={setSelected}
        preferences={preferences}
        onPreferencesChange={setPreferences}
        onRun={run}
        loading={loading}
        product={product}
        raw={raw}
        messages={messages}
        requestBody={lastBody}
        origin={origin}
      />
    </div>
  );
}
