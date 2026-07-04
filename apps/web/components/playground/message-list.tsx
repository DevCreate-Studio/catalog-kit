"use client";

import { Info } from "lucide-react";
import { asCatalogMessage } from "./shared";

/**
 * Renders a catalog `messages[]` array as a readable prose list (finding #19).
 *
 * Each entry leads with its human-readable `content` (e.g. an ignored-filter or
 * unsupported-attribute notice), tagged with its `code`/`path` as small meta,
 * and keeps the raw JSON one click away behind a `<details>` toggle so nothing
 * is hidden from a developer inspecting the response.
 */
export function MessageList({ messages }: { messages: unknown[] }) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No messages. This is where the API surfaces ignored filters and
        unsupported attribute names.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {messages.map((raw, i) => {
        const m = asCatalogMessage(raw);
        return (
          <li
            key={i}
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
          >
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <div className="min-w-0 space-y-1.5">
                <p className="text-foreground">
                  {m.content ?? "This message has no text — see the raw entry below."}
                </p>
                {m.code || m.path ? (
                  <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {m.code ? (
                      <span>
                        code <span className="font-mono">{m.code}</span>
                      </span>
                    ) : null}
                    {m.path ? (
                      <span>
                        at <span className="font-mono">{m.path}</span>
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <details className="group">
                  <summary className="cursor-pointer list-none text-xs text-muted-foreground underline-offset-2 hover:underline">
                    <span className="group-open:hidden">Show raw JSON</span>
                    <span className="hidden group-open:inline">Hide raw JSON</span>
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-md border bg-muted/40 p-2 text-xs leading-relaxed">
                    {JSON.stringify(raw, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
