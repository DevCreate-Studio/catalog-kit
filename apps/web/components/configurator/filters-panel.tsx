"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { CatalogConfig } from "catalog-kit";
import { useConfigStore } from "@/lib/config-store";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/components/playground/shared";
import { TAXONOMY_META } from "@/lib/taxonomy";
import { CategoryPicker } from "./category-picker";
import { AttributeValueSelect, hasCanonicalValues } from "./attribute-values";
import {
  COMMON_COUNTRIES,
  Field,
  SUPPORTED_ATTRIBUTE_NAMES,
  ToggleRow,
} from "./shared";

type Filters = NonNullable<CatalogConfig["filters"]>;

/** Stable empty set for the "no rows force-open" case (avoids a new Set each render). */
const EMPTY_KEYS: ReadonlySet<keyof Filters> = new Set();

/**
 * Middle panel — all 10 filters, each a toggle row that expands to its
 * controls, plus the pagination limit and the `view: "offer"` toggle. Reads and
 * writes the store's `setFilter`, `setPaginationLimit`, and `setView` actions.
 */
export function FiltersPanel() {
  const config = useConfigStore((s) => s.config);
  const setFilter = useConfigStore((s) => s.setFilter);
  const setPaginationLimit = useConfigStore((s) => s.setPaginationLimit);
  const setView = useConfigStore((s) => s.setView);
  const configEpoch = useConfigStore((s) => s.configEpoch);

  const filters: Filters = config.filters ?? {};
  const has = <K extends keyof Filters>(key: K) => filters[key] !== undefined;

  // A row is "open" if the config already carries the filter, OR the user just
  // toggled it on. The second half is local UI state because some filters
  // canonicalize to an empty value that the store strips (e.g. shop_ids → []),
  // which would otherwise snap the toggle right back off. The open set is stamped
  // with the config epoch and ignored once a fresh config lands (loadConfig/reset
  // bumps the epoch) — so it self-clears with no effect and never goes stale.
  const [openState, setOpenState] = useState<{ epoch: number; keys: Set<keyof Filters> }>(
    () => ({ epoch: configEpoch, keys: new Set() }),
  );
  const openKeys = openState.epoch === configEpoch ? openState.keys : EMPTY_KEYS;

  const isOpen = <K extends keyof Filters>(key: K) => has(key) || openKeys.has(key);

  function toggleFilter<K extends keyof Filters>(key: K, on: boolean, seed: Filters[K]) {
    setOpenState((prev) => {
      const keys = new Set<keyof Filters>(prev.epoch === configEpoch ? prev.keys : []);
      if (on) keys.add(key);
      else keys.delete(key);
      return { epoch: configEpoch, keys };
    });
    setFilter(key, on ? seed : undefined);
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">Filters</h2>
      </div>

      <div className="space-y-3">
        {/* available */}
        <ToggleRow
          id="f-available"
          label="Available"
          hint="Restrict to in-stock products. Defaults to true server-side."
          enabled={isOpen("available")}
          onToggle={(on) => toggleFilter("available", on, true)}
        >
          <div className="flex items-center gap-2">
            <Switch
              id="available-value"
              checked={filters.available ?? true}
              onCheckedChange={(v) => setFilter("available", v)}
            />
            <Label htmlFor="available-value" className="text-xs">
              {filters.available === false ? "false" : "true"}
            </Label>
          </div>
        </ToggleRow>

        {/* price */}
        <ToggleRow
          id="f-price"
          label="Price"
          hint="Min / max in major units — stored as minor-unit integers."
          enabled={isOpen("price")}
          onToggle={(on) => toggleFilter("price", on, {})}
        >
          <PriceControls
            value={filters.price ?? {}}
            currency={config.context?.currency}
            onChange={(next) =>
              setFilter(
                "price",
                Object.keys(next).length > 0 ? next : {},
              )
            }
          />
        </ToggleRow>

        {/* condition */}
        <ToggleRow
          id="f-condition"
          label="Condition"
          enabled={isOpen("condition")}
          onToggle={(on) =>
            toggleFilter("condition", on, ["new"])
          }
        >
          <CheckboxGroup
            options={["new", "secondhand"]}
            selected={filters.condition ?? []}
            onChange={(next) =>
              setFilter(
                "condition",
                next.length > 0
                  ? (next as NonNullable<Filters["condition"]>)
                  : [],
              )
            }
          />
        </ToggleRow>

        {/* ships_to */}
        <ToggleRow
          id="f-ships-to"
          label="Ships to"
          enabled={isOpen("ships_to")}
          onToggle={(on) =>
            toggleFilter("ships_to", on, { country: "US" })
          }
        >
          <ShipsToControls
            value={filters.ships_to ?? { country: "US" }}
            onChange={(next) => setFilter("ships_to", next)}
          />
        </ToggleRow>

        {/* ships_from */}
        <ToggleRow
          id="f-ships-from"
          label="Ships from"
          enabled={isOpen("ships_from")}
          onToggle={(on) =>
            toggleFilter("ships_from", on, [{ country: "US" }])
          }
        >
          <ShipsFromControls
            value={filters.ships_from ?? []}
            onChange={(next) =>
              setFilter("ships_from", next.length > 0 ? next : [])
            }
          />
        </ToggleRow>

        {/* shop_ids */}
        <ToggleRow
          id="f-shop-ids"
          label="Shop IDs"
          hint="One per line, up to 1000."
          enabled={isOpen("shop_ids")}
          onToggle={(on) => toggleFilter("shop_ids", on, [])}
        >
          <ShopIdsControls
            value={filters.shop_ids ?? []}
            onChange={(next) => setFilter("shop_ids", next)}
          />
        </ToggleRow>

        {/* attributes */}
        <ToggleRow
          id="f-attributes"
          label="Attributes"
          enabled={isOpen("attributes")}
          onToggle={(on) =>
            toggleFilter("attributes", on, [{ name: "Color", values: [] }])
          }
        >
          <AttributesControls
            value={filters.attributes ?? []}
            onChange={(next) => setFilter("attributes", next)}
          />
        </ToggleRow>

        {/* rating */}
        <ToggleRow
          id="f-rating"
          label="Rating"
          enabled={isOpen("rating")}
          onToggle={(on) =>
            toggleFilter("rating", on, { variant: { min: 4 } })
          }
        >
          <RatingControls
            value={filters.rating ?? { variant: {} }}
            onChange={(next) => setFilter("rating", next)}
          />
        </ToggleRow>

        {/* price_tier */}
        <ToggleRow
          id="f-price-tier"
          label="Price tier"
          enabled={isOpen("price_tier")}
          onToggle={(on) =>
            toggleFilter("price_tier", on, ["medium"])
          }
        >
          <CheckboxGroup
            options={["low", "medium", "high"]}
            selected={filters.price_tier ?? []}
            onChange={(next) =>
              setFilter(
                "price_tier",
                next.length > 0
                  ? (next as NonNullable<Filters["price_tier"]>)
                  : [],
              )
            }
          />
        </ToggleRow>

        {/* categories */}
        <ToggleRow
          id="f-categories"
          label="Categories"
          hint={
            <>
              Search or browse the Shopify taxonomy ({TAXONOMY_META.tag}) — pairs
              with a query.
            </>
          }
          enabled={isOpen("categories")}
          onToggle={(on) => toggleFilter("categories", on, [""])}
        >
          <CategoryPicker
            value={filters.categories ?? []}
            onChange={(next) => setFilter("categories", next)}
          />
        </ToggleRow>
      </div>

      {/* Pagination + view */}
      <div className="space-y-4 border-t border-border pt-5">
        <Field label={`Result limit — ${config.pagination?.limit ?? 12}`}>
          <Slider
            min={1}
            max={50}
            value={[config.pagination?.limit ?? 12]}
            onValueChange={(v) =>
              setPaginationLimit(Array.isArray(v) ? v[0] : v)
            }
          />
        </Field>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
          <div>
            <Label htmlFor="view-offer" className="text-sm font-medium">
              Offer view
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Return one row per seller offer — for comparison shopping across
              merchants.
            </p>
          </div>
          <Switch
            id="view-offer"
            checked={config.view === "offer"}
            onCheckedChange={(on) => setView(on ? "offer" : undefined)}
          />
        </div>
      </div>
    </section>
  );
}

/* ── Price ─────────────────────────────────────────────────────────────── */

function PriceControls({
  value,
  currency,
  onChange,
}: {
  value: NonNullable<Filters["price"]>;
  currency?: string;
  onChange: (next: NonNullable<Filters["price"]>) => void;
}) {
  function majorToMinor(major: string): number | undefined {
    if (major.trim() === "") return undefined;
    const n = Number(major);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n * 100);
  }
  function minorToMajor(minor: number | undefined): string {
    return minor === undefined ? "" : String(minor / 100);
  }
  function set(key: "min" | "max", major: string) {
    const next = { ...value };
    const minor = majorToMinor(major);
    if (minor === undefined) delete next[key];
    else next[key] = minor;
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Min (major units)" htmlFor="price-min">
          <Input
            id="price-min"
            inputMode="decimal"
            value={minorToMajor(value.min)}
            onChange={(e) => set("min", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Max (major units)" htmlFor="price-max">
          <Input
            id="price-max"
            inputMode="decimal"
            value={minorToMajor(value.max)}
            onChange={(e) => set("max", e.target.value)}
            placeholder="50"
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        {pricePreview("min", value.min, currency)}
        {value.min !== undefined && value.max !== undefined ? " · " : ""}
        {pricePreview("max", value.max, currency)}
      </p>
    </div>
  );
}

function pricePreview(
  label: string,
  minor: number | undefined,
  currency?: string,
): string {
  if (minor === undefined) return "";
  const money = formatMoney({ amount: minor, currency });
  return `${label} ${money} → ${minor}`;
}

/* ── Checkbox group (condition, price_tier) ────────────────────────────── */

function CheckboxGroup({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(opt: string) {
    onChange(
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt],
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(opt)}
            className={`rounded-md border px-2.5 py-1 text-xs capitalize transition-colors ${
              on
                ? "border-primary bg-primary/5 font-medium"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/* ── Country select (reused) ───────────────────────────────────────────── */

function CountrySelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Country" />
      </SelectTrigger>
      <SelectContent>
        {COMMON_COUNTRIES.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.code} — {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ── ships_to ──────────────────────────────────────────────────────────── */

function ShipsToControls({
  value,
  onChange,
}: {
  value: NonNullable<Filters["ships_to"]>;
  onChange: (next: NonNullable<Filters["ships_to"]>) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Country">
        <CountrySelect
          value={value.country}
          onChange={(country) => onChange({ ...value, country })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Region (optional)" htmlFor="ships-to-region">
          <Input
            id="ships-to-region"
            value={value.region ?? ""}
            onChange={(e) => {
              const next = { ...value };
              if (e.target.value) next.region = e.target.value;
              else delete next.region;
              onChange(next);
            }}
          />
        </Field>
        <Field label="Postal (optional)" htmlFor="ships-to-postal">
          <Input
            id="ships-to-postal"
            value={value.postal_code ?? ""}
            onChange={(e) => {
              const next = { ...value };
              if (e.target.value) next.postal_code = e.target.value;
              else delete next.postal_code;
              onChange(next);
            }}
          />
        </Field>
      </div>
    </div>
  );
}

/* ── ships_from (repeatable) ───────────────────────────────────────────── */

function ShipsFromControls({
  value,
  onChange,
}: {
  value: NonNullable<Filters["ships_from"]>;
  onChange: (next: NonNullable<Filters["ships_from"]>) => void;
}) {
  return (
    <div className="space-y-2">
      {value.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1">
            <CountrySelect
              value={row.country}
              onChange={(country) => {
                const next = [...value];
                next[i] = { country };
                onChange(next);
              }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label="Remove country"
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, { country: "US" }])}
      >
        <Plus className="size-3.5" /> Add country
      </Button>
    </div>
  );
}

/* ── shop_ids ──────────────────────────────────────────────────────────── */

function ShopIdsControls({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [text, setText] = useState(value.join("\n"));
  const ids = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const overCap = ids.length > 1000;

  return (
    <div className="space-y-1.5">
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = e.target.value
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(parsed);
        }}
        spellCheck={false}
        placeholder={"1234567890\n9876543210"}
        className="min-h-24 font-mono text-xs"
      />
      <p
        className={`text-xs ${overCap ? "text-destructive" : "text-muted-foreground"}`}
      >
        {ids.length} / 1000 shop ID{ids.length === 1 ? "" : "s"}
        {overCap ? " — over the cap" : ""}
      </p>
    </div>
  );
}

/* ── attributes ────────────────────────────────────────────────────────── */

function AttributesControls({
  value,
  onChange,
}: {
  value: NonNullable<Filters["attributes"]>;
  onChange: (next: NonNullable<Filters["attributes"]>) => void;
}) {
  return (
    <div className="space-y-3">
      {value.map((row, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border p-2">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Select
                value={row.name}
                onValueChange={(name) => {
                  const next = [...value];
                  next[i] = { ...row, name: name ?? row.name };
                  onChange(next);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Attribute" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_ATTRIBUTE_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label="Remove attribute"
            >
              <X className="size-4" />
            </Button>
          </div>
          {hasCanonicalValues(row.name) ? (
            <AttributeValueSelect
              name={row.name}
              values={row.values}
              onChange={(values) => {
                // Deselecting every value removes the whole attribute entry.
                if (values.length === 0) {
                  onChange(value.filter((_, j) => j !== i));
                  return;
                }
                const next = [...value];
                next[i] = { ...row, values };
                onChange(next);
              }}
            />
          ) : (
            <Input
              value={row.values.join(", ")}
              onChange={(e) => {
                const values = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const next = [...value];
                next[i] = { ...row, values };
                onChange(next);
              }}
              placeholder="comma-separated values, e.g. Red, Blue"
            />
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, { name: "Color", values: [] }])}
      >
        <Plus className="size-3.5" /> Add attribute
      </Button>
      <p className="text-xs text-muted-foreground">
        Only Color, Size, and Target gender are honored — any other name is
        silently ignored and will show in Messages.
      </p>
    </div>
  );
}

/* ── rating ────────────────────────────────────────────────────────────── */

function RatingControls({
  value,
  onChange,
}: {
  value: NonNullable<Filters["rating"]>;
  onChange: (next: NonNullable<Filters["rating"]>) => void;
}) {
  const min = value.variant.min ?? 0;
  const minCount = value.variant.min_count;
  return (
    <div className="space-y-3">
      <Field label={`Minimum rating — ${min.toFixed(1)}`}>
        <Slider
          min={0}
          max={5}
          step={0.5}
          value={[min]}
          onValueChange={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            onChange({ variant: { ...value.variant, min: next } });
          }}
        />
      </Field>
      <Field label="Minimum review count (optional)" htmlFor="rating-count">
        <Input
          id="rating-count"
          inputMode="numeric"
          value={minCount === undefined ? "" : String(minCount)}
          onChange={(e) => {
            const raw = e.target.value.trim();
            const variant = { ...value.variant };
            if (raw === "") delete variant.min_count;
            else {
              const n = Number(raw);
              if (Number.isFinite(n) && n >= 0) variant.min_count = Math.round(n);
            }
            onChange({ variant });
          }}
          placeholder="10"
        />
      </Field>
    </div>
  );
}

