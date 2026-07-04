"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Thin client wrapper around next-themes so the root (server) layout can mount
 * theme support. Toggling adds/removes `.dark` on <html> (attribute="class"),
 * which drives both the app's shadcn `.dark` tokens and the landing's scoped
 * `.dark [data-landing]` palette (see globals.css). Finding #21.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
