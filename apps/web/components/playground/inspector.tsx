"use client";

import { ExternalLink, Loader2, Plus, Store, Trash2, X } from "lucide-react";
import type { CatalogProduct } from "catalog-kit";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "./copy-button";
import { MessageList } from "./message-list";
import {
  formatMoney,
  productImage,
  productRating,
  sellerDomain,
  curlFor,
} from "./shared";

export interface SelectedRow {
  name: string;
  value: string;
}

interface Variant {
  id?: string;
  title?: string;
  price?: { amount?: number; currency?: string };
  availability?: { available?: boolean } & Record<string, unknown>;
  checkout_url?: string;
}

interface ProductOption {
  name?: string;
  values?: Array<{ value?: string; available?: boolean } | string>;
}

/** Render the returned product: image, options matrix (if present), variants list. */
function ProductDetail({ product }: { product: CatalogProduct }) {
  const image = productImage(product);
  const rating = productRating(product);
  const seller = sellerDomain(product);
  const variants = (product.variants ?? []) as Variant[];
  // The catalog get_product response does not always carry a discrete options
  // matrix; render it when present, otherwise fall back to the variants list.
  const options = (product as { options?: ProductOption[] }).options ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row">
        {image ? (
          <div className="aspect-square w-full max-w-56 shrink-0 overflow-hidden rounded-lg border bg-muted">
            {/* Plain <img>: hot-linked merchant CDN, no next/image (compliance). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.alt} className="size-full object-cover" />
          </div>
        ) : null}
        <div className="min-w-0 space-y-2">
          <h3 className="text-base font-semibold leading-snug">
            {product.title || "Untitled product"}
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {rating ? (
              <span>
                ★ {rating.value.toFixed(1)}
                {rating.count ? ` (${rating.count})` : ""}
              </span>
            ) : null}
            {seller ? (
              <span className="inline-flex items-center gap-1">
                <Store className="size-3.5" />
                {seller}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {options.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Options</p>
          {options.map((opt, i) => (
            <div key={i} className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{opt.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {(opt.values ?? []).map((v, j) => {
                  const value = typeof v === "string" ? v : v.value;
                  const available = typeof v === "string" ? undefined : v.available;
                  return (
                    <Badge
                      key={j}
                      variant={available === false ? "outline" : "secondary"}
                      className={available === false ? "line-through opacity-60" : ""}
                    >
                      {value}
                    </Badge>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium">Variants ({variants.length})</p>
        <div className="divide-y rounded-lg border">
          {variants.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No variants returned.</p>
          ) : (
            variants.map((v, i) => {
              const price = formatMoney(v.price);
              const available = v.availability?.available;
              return (
                <div
                  key={v.id ?? i}
                  className="flex items-center justify-between gap-3 p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate" title={v.title}>
                      {v.title || v.id || `Variant ${i + 1}`}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {price ? <span className="font-medium text-foreground">{price}</span> : null}
                      {available === true ? (
                        <span className="text-green-600 dark:text-green-500">In stock</span>
                      ) : available === false ? (
                        <span className="text-destructive">Out of stock</span>
                      ) : null}
                    </div>
                  </div>
                  {v.checkout_url ? (
                    // Plain styled <a> (not Button): the checkout link is an
                    // external navigation, and buttonVariants gives it the same
                    // look without wrapping an <a> in a native <button>.
                    <a
                      href={v.checkout_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Buy
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The Get-product inspector: id input, `selected` name/value rows (add/remove),
 * ordered `preferences` list (add/remove/reorder), Run, and the rendered product
 * plus Raw JSON / Messages / Request tabs.
 */
export function Inspector({
  id,
  onIdChange,
  selected,
  onSelectedChange,
  preferences,
  onPreferencesChange,
  onRun,
  loading,
  product,
  raw,
  messages,
  requestBody,
  origin,
}: {
  id: string;
  onIdChange: (v: string) => void;
  selected: SelectedRow[];
  onSelectedChange: (rows: SelectedRow[]) => void;
  preferences: string[];
  onPreferencesChange: (prefs: string[]) => void;
  onRun: () => void;
  loading: boolean;
  product: CatalogProduct | null;
  raw: unknown;
  messages: unknown[];
  requestBody: unknown;
  origin: string;
}) {
  const messageCount = messages.length;

  function updateSelected(i: number, patch: Partial<SelectedRow>) {
    onSelectedChange(selected.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function movePreference(i: number, dir: -1 | 1) {
    const next = [...preferences];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onPreferencesChange(next);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      {/* Left: inputs */}
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="gp-id">Product id</Label>
          <Input
            id="gp-id"
            value={id}
            onChange={(e) => onIdChange(e.target.value)}
            placeholder="gid://shopify/p/…"
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Selected options</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelectedChange([...selected, { name: "", value: "" }])}
            >
              <Plus className="size-3.5" /> Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pin specific option values (e.g. Color = Black) to select the exact
            variant.
          </p>
          {selected.length === 0 ? (
            <p className="text-xs text-muted-foreground">No selected options.</p>
          ) : (
            <div className="space-y-2">
              {selected.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={row.name}
                    onChange={(e) => updateSelected(i, { name: e.target.value })}
                    placeholder="name"
                    className="text-xs"
                  />
                  <Input
                    value={row.value}
                    onChange={(e) => updateSelected(i, { value: e.target.value })}
                    placeholder="value"
                    className="text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onSelectedChange(selected.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Preferences (ordered)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onPreferencesChange([...preferences, ""])}
            >
              <Plus className="size-3.5" /> Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            When no exact variant matches, the order to relax option constraints —
            earlier options are honored first.
          </p>
          {preferences.length === 0 ? (
            <p className="text-xs text-muted-foreground">No preferences.</p>
          ) : (
            <div className="space-y-2">
              {preferences.map((pref, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
                  <Input
                    value={pref}
                    onChange={(e) =>
                      onPreferencesChange(
                        preferences.map((p, idx) => (idx === i ? e.target.value : p)),
                      )
                    }
                    placeholder="preference"
                    className="text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={i === 0}
                    onClick={() => movePreference(i, -1)}
                    aria-label="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={i === preferences.length - 1}
                    onClick={() => movePreference(i, 1)}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onPreferencesChange(preferences.filter((_, idx) => idx !== i))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button type="button" onClick={onRun} disabled={loading || !id.trim()} className="w-full">
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          Run get_product
        </Button>
      </div>

      {/* Right: result */}
      <div className="min-w-0">
        {product || raw ? (
          <Tabs defaultValue="product" className="w-full">
            <TabsList>
              <TabsTrigger value="product">Product</TabsTrigger>
              <TabsTrigger value="raw">Raw JSON</TabsTrigger>
              <TabsTrigger value="messages" className="gap-1.5">
                Messages
                {messageCount > 0 ? (
                  <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                    {messageCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="request">Request</TabsTrigger>
            </TabsList>
            <TabsContent value="product" className="mt-4">
              {product ? (
                <ProductDetail product={product} />
              ) : (
                <p className="text-sm text-muted-foreground">No product returned.</p>
              )}
            </TabsContent>
            <TabsContent value="raw" className="mt-4 space-y-2">
              <CopyButton value={JSON.stringify(raw, null, 2)} label="Copy JSON" />
              <pre className="max-h-[28rem] overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
                {JSON.stringify(raw, null, 2)}
              </pre>
            </TabsContent>
            <TabsContent value="messages" className="mt-4">
              <MessageList messages={messages} />
            </TabsContent>
            <TabsContent value="request" className="mt-4 space-y-4">
              <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
                {JSON.stringify(requestBody, null, 2)}
              </pre>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">cURL equivalent</p>
                <CopyButton value={curlFor(requestBody, origin)} label="Copy cURL" />
              </div>
              <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
                {curlFor(requestBody, origin)}
              </pre>
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-sm text-muted-foreground">
            Enter a product id and run to inspect it. Click “Inspect” on any search
            or lookup result to prefill this.
          </p>
        )}
      </div>
    </div>
  );
}
