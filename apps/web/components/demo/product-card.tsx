"use client";

import { ExternalLink, Sparkles, Star, Store } from "lucide-react";
import type { CatalogProduct } from "catalog-kit";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  productImage,
  productLink,
  productPrice,
  productRating,
  sellerDomain,
} from "@/components/playground/shared";

/**
 * Storefront product card for the demo grid.
 *
 * Images are hot-linked with a plain <img> (never next/image, never proxied) —
 * the same compliance rule as the playground card: merchant images must render
 * in real time from their own CDN, not be downloaded or re-hosted.
 *
 * "View product" links out to the variant checkout_url / product URL.
 * "Similar" fires more-like-this (re-search with like:[{id}]) in one click.
 */
export function DemoProductCard({
  product,
  onSimilar,
  active = false,
}: {
  product: CatalogProduct;
  onSimilar: (id: string, title: string) => void;
  /** True when this card is the source of the current "similar" search. */
  active?: boolean;
}) {
  const image = productImage(product);
  const price = productPrice(product);
  const rating = productRating(product);
  const seller = sellerDomain(product);
  const link = productLink(product);
  const id = product.id;
  const title = product.title || "Untitled product";

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md",
        active && "border-primary/50 ring-2 ring-primary/30",
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- hot-linked cross-merchant CDN image; no next/image (see component doc).
          <img
            src={image.url}
            alt={image.alt}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p
          className="line-clamp-2 text-sm font-medium leading-snug"
          title={product.title}
        >
          {title}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {price ? (
            <span className="text-sm font-semibold text-foreground">{price}</span>
          ) : null}
          {rating ? (
            <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${rating.value.toFixed(1)} out of 5`}>
              <Star className="size-3 fill-amber-400 text-amber-400" />
              {rating.value.toFixed(1)}
              {rating.count ? (
                <span className="opacity-70">({rating.count})</span>
              ) : null}
            </span>
          ) : null}
        </div>

        {seller ? (
          <span
            className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground"
            title={seller}
          >
            <Store className="size-3 shrink-0" />
            <span className="truncate">{seller}</span>
          </span>
        ) : null}

        <div className="mt-auto flex gap-2 pt-2">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "flex-1",
              )}
            >
              <ExternalLink className="size-3.5" />
              View product
            </a>
          ) : (
            <Button variant="default" size="sm" className="flex-1" disabled>
              View product
            </Button>
          )}
          <Button
            type="button"
            variant={active ? "secondary" : "outline"}
            size="sm"
            disabled={!id}
            aria-pressed={active}
            onClick={() => id && onSimilar(id, title)}
            title="Find similar products (more-like-this)"
          >
            <Sparkles className="size-3.5" />
            Similar
          </Button>
        </div>
      </div>
    </div>
  );
}
