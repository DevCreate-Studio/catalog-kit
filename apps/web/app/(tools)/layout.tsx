import { SiteHeader } from "@/components/site-header";

/**
 * Shared layout for the tool pages (/configure, /playground, /demo). A route
 * group — `(tools)` is stripped from the URL, so paths are unchanged — that
 * renders one sticky `SiteHeader` above every tool page so users can always
 * get back to the main site.
 */
export default function ToolsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
