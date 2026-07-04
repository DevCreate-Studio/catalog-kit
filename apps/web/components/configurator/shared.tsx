"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Small shared building blocks for the configurator panels: the reusable
 * toggle-row that expands into a filter's controls, plus the curated
 * ISO/BCP47 option lists used by the context selects.
 */

/**
 * A labelled toggle row. When `enabled`, the children (the filter's controls)
 * render below. Toggling off is the caller's cue to delete the filter key.
 */
export function ToggleRow({
  id,
  label,
  hint,
  enabled,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
            {label}
          </Label>
          {hint ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <Switch id={id} checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && children ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A small labelled field wrapper for controls inside a ToggleRow. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Curated common ISO 3166-1 alpha-2 countries; the input also allows free entry. */
export const COMMON_COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "JP", name: "Japan" },
  { code: "MX", name: "Mexico" },
  { code: "BR", name: "Brazil" },
  { code: "IN", name: "India" },
];

/** Common BCP 47 language tags. */
export const COMMON_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: "en", name: "English" },
  { code: "en-US", name: "English (US)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "pt-BR", name: "Portuguese (Brazil)" },
  { code: "nl", name: "Dutch" },
];

/** Common ISO 4217 currency codes. */
export const COMMON_CURRENCIES: Array<{ code: string; name: string }> = [
  { code: "USD", name: "US Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "GBP", name: "British Pound" },
  { code: "EUR", name: "Euro" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "INR", name: "Indian Rupee" },
  { code: "SEK", name: "Swedish Krona" },
];

/**
 * The only attribute names the API honors (see docs/probe-findings.md). Any
 * other name is silently ignored server-side and surfaces in `messages[]`.
 */
export const SUPPORTED_ATTRIBUTE_NAMES = [
  "Color",
  "Size",
  "Target gender",
] as const;

/** Sentinel used by selects that allow a free-typed value not in the list. */
export const CUSTOM_VALUE = "__custom__";
