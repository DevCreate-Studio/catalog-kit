"use client";

import { Globe, Store } from "lucide-react";
import { useConfigStore, type SearchMode } from "@/lib/config-store";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMMON_COUNTRIES,
  COMMON_CURRENCIES,
  COMMON_LANGUAGES,
  CUSTOM_VALUE,
  Field,
} from "./shared";

/**
 * Left panel — scope, search mode, query inputs, and buyer context. Drives the
 * store's scope/query/like/context actions. Storefront scope is shown but
 * disabled to signal the capability (the client already supports it).
 */

const SEARCH_MODES: Array<{ value: SearchMode; label: string }> = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "more-like-this", label: "More like this" },
  { value: "multimodal", label: "Text + Image" },
];

export function ScopePanel() {
  const config = useConfigStore((s) => s.config);
  const searchMode = useConfigStore((s) => s.searchMode);
  const setSearchMode = useConfigStore((s) => s.setSearchMode);
  const setQuery = useConfigStore((s) => s.setQuery);
  const setLikeImageUrl = useConfigStore((s) => s.setLikeImageUrl);
  const setLikeItemId = useConfigStore((s) => s.setLikeItemId);
  const setSavedCatalogSlug = useConfigStore((s) => s.setSavedCatalogSlug);
  const setContextField = useConfigStore((s) => s.setContextField);

  const isGlobal = config.scope.type === "global";
  const savedSlug =
    config.scope.type === "global" ? config.scope.savedCatalogSlug ?? "" : "";
  const query = config.query ?? "";
  const likeEntry = config.like?.[0];
  const imageUrl =
    likeEntry && "image_url" in likeEntry ? likeEntry.image_url : "";
  const itemId = likeEntry && "id" in likeEntry ? likeEntry.id : "";
  const context = config.context ?? {};

  const showQuery = searchMode === "text" || searchMode === "multimodal";
  const showImage = searchMode === "image" || searchMode === "multimodal";
  const showItemId = searchMode === "more-like-this";

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">Scope &amp; query</h2>
      </div>

      {/* Scope selector */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Scope</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={isGlobal}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
              isGlobal
                ? "border-primary bg-primary/5 font-medium text-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <Globe className="size-4" /> Global
          </button>
          <button
            type="button"
            disabled
            aria-describedby="scope-storefront-help"
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground opacity-60"
          >
            <Store className="size-4" /> Storefront
          </button>
        </div>
        <p id="scope-storefront-help" className="text-xs text-muted-foreground">
          Storefront (single-store) scope isn&apos;t wired up in this UI yet — the
          client already supports it. See{" "}
          <code className="font-mono">docs/configuration.md#storefront</code>.
        </p>
      </div>

      {/* Saved catalog slug (global only) */}
      {isGlobal ? (
        <Field label="Saved catalog slug (optional)" htmlFor="saved-slug">
          <Input
            id="saved-slug"
            value={savedSlug}
            onChange={(e) => setSavedCatalogSlug(e.target.value || undefined)}
            placeholder="my-curated-catalog"
          />
          <p className="text-xs text-muted-foreground">
            A saved catalog from the Dev Dashboard — its saved filters take
            precedence over request values.
          </p>
        </Field>
      ) : null}

      {/* Search mode segmented control */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Search mode</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SEARCH_MODES.map((mode) => {
            const active = searchMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                aria-pressed={active}
                onClick={() => setSearchMode(mode.value)}
                className={`rounded-lg border px-2 py-1.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                  active
                    ? "border-primary bg-primary/5 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode-specific inputs */}
      {showQuery ? (
        <Field label="Query" htmlFor="query">
          <Textarea
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="wireless noise-cancelling headphones"
            className="min-h-20"
          />
        </Field>
      ) : null}

      {showImage ? (
        <Field label="Reference image URL" htmlFor="image-url">
          <Input
            id="image-url"
            value={imageUrl}
            onChange={(e) => setLikeImageUrl(e.target.value)}
            placeholder="https://cdn.example.com/reference.jpg"
          />
          <p className="text-xs text-muted-foreground">
            Fetched &amp; inlined as base64 at request time — the API doesn&apos;t
            accept URLs.
          </p>
        </Field>
      ) : null}

      {showItemId ? (
        <Field label="Reference product id" htmlFor="item-id">
          <Input
            id="item-id"
            value={itemId}
            onChange={(e) => setLikeItemId(e.target.value)}
            placeholder="gid://shopify/p/…"
          />
          <p className="text-xs text-muted-foreground">
            Paste a product id from your results, e.g.{" "}
            <code className="font-mono">gid://shopify/p/…</code>
          </p>
        </Field>
      ) : null}

      {/* Buyer context */}
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground">Buyer context</Label>

        <div className="grid grid-cols-2 gap-3">
          <ContextSelect
            label="Country"
            value={context.address_country}
            placeholder="ISO alpha-2"
            options={COMMON_COUNTRIES.map((c) => ({
              value: c.code,
              label: `${c.code} — ${c.name}`,
            }))}
            onChange={(v) => setContextField("address_country", v)}
          />
          <Field label="Region" htmlFor="ctx-region">
            <Input
              id="ctx-region"
              value={context.address_region ?? ""}
              onChange={(e) =>
                setContextField("address_region", e.target.value || undefined)
              }
              placeholder="CA"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Postal code" htmlFor="ctx-postal">
            <Input
              id="ctx-postal"
              value={context.postal_code ?? ""}
              onChange={(e) =>
                setContextField("postal_code", e.target.value || undefined)
              }
              placeholder="94103"
            />
          </Field>
          <ContextSelect
            label="Language"
            value={context.language}
            placeholder="BCP 47"
            options={COMMON_LANGUAGES.map((l) => ({
              value: l.code,
              label: `${l.code} — ${l.name}`,
            }))}
            onChange={(v) => setContextField("language", v)}
          />
        </div>

        <ContextSelect
          label="Currency"
          value={context.currency}
          placeholder="ISO 4217"
          options={COMMON_CURRENCIES.map((c) => ({
            value: c.code,
            label: `${c.code} — ${c.name}`,
          }))}
          onChange={(v) => setContextField("currency", v)}
        />

        <Field label="Intent" htmlFor="ctx-intent">
          <Textarea
            id="ctx-intent"
            value={context.intent ?? ""}
            onChange={(e) =>
              setContextField("intent", e.target.value || undefined)
            }
            placeholder="durable gift for a coffee-obsessed dad, under $50"
            className="min-h-16"
          />
        </Field>
      </div>
    </section>
  );
}

/** A select of common codes with a "Clear" option; value maps to the context field. */
function ContextSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string | undefined;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Field label={label}>
      <Select
        value={value ?? ""}
        onValueChange={(v) =>
          onChange(v === "" || v === CUSTOM_VALUE || v == null ? undefined : v)
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CUSTOM_VALUE}>None</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
