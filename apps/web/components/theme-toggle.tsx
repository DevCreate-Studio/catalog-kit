"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * `true` once mounted on the client, `false` during SSR/first render. Derived
 * via useSyncExternalStore so we never call setState in an effect (this repo's
 * lint forbids it) — the server snapshot is always `false`, the client snapshot
 * always `true`, so React swaps them on hydration without a cascading render.
 */
const emptySubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * Compact light/dark toggle for the site header and landing nav (finding #21).
 *
 * Flips between explicit "light" and "dark" (resolving "system" on first click
 * to whatever the OS currently shows). Colors are inherited via `currentColor`
 * so the same component reads correctly on the neutral header and the landing's
 * chartreuse nav. Renders an inert placeholder until mounted to avoid a
 * hydration mismatch (the server can't know the resolved theme).
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = resolvedTheme === "dark";
  const base =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border outline-none transition-colors focus-visible:ring-2 " +
    className;

  if (!mounted) {
    // Placeholder keeps layout stable and avoids rendering the wrong icon on
    // the server. aria-hidden + disabled so it's inert pre-hydration.
    return (
      <button
        type="button"
        aria-hidden
        disabled
        tabIndex={-1}
        className={base}
      >
        <Sun className="size-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={base}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
