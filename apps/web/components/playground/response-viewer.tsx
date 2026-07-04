"use client";

import { Loader2 } from "lucide-react";
import type { CatalogProduct } from "catalog-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "./copy-button";
import { MessageList } from "./message-list";
import { ProductCard } from "./product-card";
import { curlFor } from "./shared";

/** Pretty-printed, copyable JSON block inside a scroll container. */
function JsonBlock({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="space-y-2">
      <CopyButton value={text} label="Copy JSON" />
      <pre className="max-h-[28rem] overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

/**
 * Shared response viewer for the Search and Lookup tools. Tabs:
 * Products · Raw JSON · Messages · Request. `messages` drives a count badge.
 */
export function ResponseViewer({
  products,
  raw,
  messages,
  requestBody,
  origin,
  hasNextPage,
  loadingMore,
  onLoadMore,
  onInspect,
  onMoreLikeThis,
  emptyLabel = "No products returned.",
}: {
  products: CatalogProduct[];
  raw: unknown;
  messages: unknown[];
  requestBody: unknown;
  origin: string;
  hasNextPage?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onInspect: (id: string) => void;
  onMoreLikeThis: (id: string) => void;
  emptyLabel?: string;
}) {
  const messageCount = messages.length;

  return (
    <Tabs defaultValue="products" className="w-full">
      <TabsList>
        <TabsTrigger value="products">Products</TabsTrigger>
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

      <TabsContent value="products" className="mt-4 space-y-4">
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p, i) => (
                // Index in the key: appended pages (Load more) can repeat a product
                // id across pages, so id alone is not unique.
                <ProductCard
                  key={`${p.id ?? "p"}-${i}`}
                  product={p}
                  onInspect={onInspect}
                  onMoreLikeThis={onMoreLikeThis}
                />
              ))}
            </div>
            {hasNextPage && onLoadMore ? (
              // Load more re-runs with the pagination cursor and APPENDS results.
              // This is pagination, not caching — no results are stored client-side
              // beyond the current view, consistent with the no-cache compliance rule.
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </TabsContent>

      <TabsContent value="raw" className="mt-4">
        <JsonBlock value={raw} />
      </TabsContent>

      <TabsContent value="messages" className="mt-4">
        <MessageList messages={messages} />
      </TabsContent>

      <TabsContent value="request" className="mt-4 space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Body sent to the proxy (POST /api/catalog)
          </p>
          <JsonBlock value={requestBody} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">cURL equivalent</p>
            <CopyButton value={curlFor(requestBody, origin)} label="Copy cURL" />
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
            {curlFor(requestBody, origin)}
          </pre>
        </div>
      </TabsContent>
    </Tabs>
  );
}
