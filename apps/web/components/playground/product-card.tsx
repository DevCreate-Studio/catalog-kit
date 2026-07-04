"use client";

import { Sparkles, Store, Star } from "lucide-react";
import type { CatalogProduct } from "catalog-kit";
import { Button } from "@/components/ui/button";
import {
  productImage,
  productPrice,
  productRating,
  sellerDomain,
} from "./shared";

/**
 * A compact product card for the playground Products tab.
 *
 * Images are rendered with a plain <img> (NOT next/image) on purpose: compliance
 * forbids proxying/downloading merchant images, and next/image would require
 * whitelisting every merchant CDN in next.config — impossible for an open,
 * cross-merchant catalog. Hot-linking the Shopify CDN URL directly is the
 * required and simplest approach.
 */
export function ProductCard({
  product,
  onInspect,
  onMoreLikeThis,
}: {
  product: CatalogProduct;
  onInspect: (id: string) => void;
  onMoreLikeThis: (id: string) => void;
}) {
  const image = productImage(product);
  const price = productPrice(product);
  const rating = productRating(product);
  const seller = sellerDomain(product);
  const id = product.id;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="aspect-square w-full overflow-hidden bg-muted">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- see component doc: no next/image for cross-merchant hot-linked CDN images.
          <img
            src={image.url}
            alt={image.alt}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug" title={product.title}>
          {product.title || "Untitled product"}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {price ? <span className="font-semibold text-foreground">{price}</span> : null}
          {rating ? (
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3 fill-current" />
              {rating.value.toFixed(1)}
              {rating.count ? <span className="opacity-70">({rating.count})</span> : null}
            </span>
          ) : null}
          {seller ? (
            <span className="inline-flex items-center gap-0.5 truncate" title={seller}>
              <Store className="size-3" />
              <span className="truncate">{seller}</span>
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!id}
            onClick={() => id && onInspect(id)}
          >
            Inspect
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1"
            disabled={!id}
            onClick={() => id && onMoreLikeThis(id)}
          >
            <Sparkles className="size-3.5" />
            More like this
          </Button>
        </div>
      </div>
    </div>
  );
}
