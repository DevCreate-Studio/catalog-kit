"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A small copy-to-clipboard button with a "copied" confirmation flash.
 * The only interactive part of the otherwise-static command/prompt blocks —
 * kept as its own tiny client island so the surrounding blocks stay server
 * components (zero JS shipped for the text they wrap).
 */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }, [value]);

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--lp-border-strong)] px-2.5 py-1.5",
        "font-mono text-[0.7rem] tracking-tight text-[var(--lp-muted)]",
        "transition-colors outline-none",
        "hover:border-[var(--lp-accent-strong)] hover:text-[var(--lp-fg)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-0",
        className,
      )}
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-[var(--lp-accent-strong)]" aria-hidden />
          <span className="text-[var(--lp-fg)]">Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5" aria-hidden />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
