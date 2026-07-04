import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Editorial display serif — used only by the landing page's hero/section
 * headings (via `.font-display`, see globals.css) for a distinctive,
 * non-shadcn typographic signature. The rest of the app stays on Geist.
 */
const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.catalogkit.dev";
const DESCRIPTION =
  "Agent-ready open-source starter kit for the Shopify Global Catalog (UCP) — clone to live cross-merchant product search in ~2 minutes, no API key.";

// `opengraph-image.png` / `twitter-image.png` (Next file convention, same folder)
// supply the card image and its dimensions automatically; metadataBase makes their
// URLs absolute. Set NEXT_PUBLIC_SITE_URL on your own deploy to override.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "catalog-kit — the entire Shopify catalog, in your app",
    template: "%s · catalog-kit",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "catalog-kit",
    url: SITE_URL,
    title: "catalog-kit — the entire Shopify catalog, in your app",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "catalog-kit — the entire Shopify catalog, in your app",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
