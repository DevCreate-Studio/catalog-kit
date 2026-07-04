"use client";

import { Loader2 } from "lucide-react";
import type { CatalogProduct } from "catalog-kit";
import { Button } from "@/components/ui/button";
import { DemoProductCard } from "./product-card";

/**
 * Responsive results grid for the demo storefront. Load-more APPENDS the next
 * cursor page (pagination, not caching — nothing is persisted beyond the
 * current view, per the no-cache compliance rule).
 */
export function ProductGrid({
  products,
  onSimilar,
  activeSimilarId,
  hasNextPage,
  loadingMore,
  onLoadMore,
}: {
  products: CatalogProduct[];
  onSimilar: (id: string, title: string) => void;
  /** id of the product a "similar" search is currently pivoted on, for an active state. */
  activeSimilarId?: string;
  hasNextPage: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p, i) => (
          // Index in the key: appended pages can repeat an id across pages.
          <DemoProductCard
            key={`${p.id ?? "p"}-${i}`}
            product={p}
            onSimilar={onSimilar}
            active={Boolean(activeSimilarId && p.id === activeSimilarId)}
          />
        ))}
      </div>

      {hasNextPage ? (
        <div className="flex justify-center">
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
    </div>
  );
}
