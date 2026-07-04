"use client";

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import attributeValuesRaw from "@/lib/attribute-values.json";

/**
 * Canonical value labels for the three API-supported attribute names, generated
 * by `scripts/build-taxonomy.mjs` from Shopify's Standard Product Taxonomy. This
 * file is tiny (~1.5 KB) so it's imported statically. See docs/configuration.md.
 */
export const ATTRIBUTE_VALUES = attributeValuesRaw as Record<string, string[]>;

/** True when we ship a canonical value list for this attribute name. */
export function hasCanonicalValues(name: string): boolean {
  return Array.isArray(ATTRIBUTE_VALUES[name]);
}

/** Placeholder text for the "no values selected" (Any) state. */
function anyLabel(name: string): string {
  switch (name) {
    case "Color":
      return "Any color";
    case "Size":
      return "Any size";
    case "Target gender":
      return "Any gender";
    default:
      return "Any value";
  }
}

/**
 * A value multi-select for a canonical attribute: a popover of checkable
 * canonical values plus a free-text escape hatch for custom values (the API
 * tolerates unknown values). Empty selection = "Any …". The parent removes the
 * attribute entry from the config when values become empty.
 */
export function AttributeValueSelect({
  name,
  values,
  onChange,
}: {
  name: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const canonical = ATTRIBUTE_VALUES[name] ?? [];

  function toggle(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    );
  }

  // Custom (non-canonical) values the user has added via free text.
  const customValues = values.filter((v) => !canonical.includes(v));

  return (
    <div className="space-y-2">
      {/* Selected value chips */}
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li key={v}>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                  canonical.includes(v)
                    ? "border-border bg-muted/40"
                    : "border-dashed border-border font-mono"
                }`}
              >
                {v}
                <button
                  type="button"
                  onClick={() => toggle(v)}
                  aria-label={`Remove ${v}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" size="sm" className="w-full justify-between">
              <span className={values.length === 0 ? "text-muted-foreground" : ""}>
                {values.length === 0
                  ? anyLabel(name)
                  : `${values.length} selected`}
              </span>
              <Plus className="size-3.5" />
            </Button>
          }
        />
        <PopoverContent className="w-64 p-0" align="start">
          <ul className="max-h-56 overflow-y-auto p-1" role="listbox">
            {canonical.map((value) => {
              const on = values.includes(value);
              return (
                <li key={value} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => toggle(value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    {on ? (
                      <Check className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{value}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <CustomValueRow
            existing={customValues}
            onAdd={(v) => {
              if (!values.includes(v)) onChange([...values, v]);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function CustomValueRow({
  onAdd,
}: {
  existing: string[];
  onAdd: (value: string) => void;
}) {
  const [text, setText] = useState("");
  const value = text.trim();

  function commit() {
    if (value === "") return;
    onAdd(value);
    setText("");
  }

  return (
    <div className="border-t border-border p-2">
      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          spellCheck={false}
          placeholder="Custom value…"
          className="h-7 text-xs"
        />
        <Button type="button" variant="outline" size="sm" disabled={value === ""} onClick={commit}>
          Add
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Custom values are allowed — the API tolerates unknown values.
      </p>
    </div>
  );
}
