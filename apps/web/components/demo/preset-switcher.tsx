"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEMO_PRESETS, type DemoPreset } from "./presets";

/**
 * The 4-card preset switcher. Selecting a card loads that preset's
 * `examples/*.config.json` and runs it through the proxy (handled by the page).
 */
export function PresetSwitcher({
  activeSlug,
  onSelect,
}: {
  activeSlug: string;
  onSelect: (preset: DemoPreset) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {DEMO_PRESETS.map((preset) => {
        const active = preset.slug === activeSlug;
        return (
          <button
            key={preset.slug}
            type="button"
            onClick={() => onSelect(preset)}
            aria-pressed={active}
            className={cn(
              "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:border-foreground/20 hover:bg-muted/40",
            )}
          >
            <span className="text-sm font-semibold">{preset.title}</span>
            <span className="text-xs leading-snug text-muted-foreground">
              {preset.description}
            </span>
            <span className="mt-1 flex flex-wrap gap-1">
              {preset.badges.map((badge) => (
                <Badge
                  key={badge}
                  variant="secondary"
                  className="px-1.5 py-0 text-[10px] font-normal"
                >
                  {badge}
                </Badge>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
