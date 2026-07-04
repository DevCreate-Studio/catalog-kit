import { CopyButton } from "./copy-button";
import { cn } from "@/lib/utils";

/**
 * A terminal-styled command block: a leading `$` prompt glyph, monospace
 * command text, and a copy button. Static server component wrapping the
 * one small client island (CopyButton).
 */
export function CommandBlock({
  command,
  className,
  copyLabel = "Copy",
}: {
  command: string;
  className?: string;
  copyLabel?: string;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-[var(--lp-border-strong)] bg-[var(--lp-panel)] px-4 py-3",
        "shadow-[0_1px_0_0_var(--lp-border)]",
        className,
      )}
    >
      <span
        aria-hidden
        className="select-none font-mono text-sm font-semibold text-[var(--lp-accent-strong)]"
      >
        $
      </span>
      <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-[var(--lp-fg)]">
        {command}
      </code>
      <CopyButton value={command} label={copyLabel} className="shrink-0" />
    </div>
  );
}
