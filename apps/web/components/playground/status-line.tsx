import { Badge } from "@/components/ui/badge";
import type { ProxyMeta } from "./shared";

/** Small status line shown after each run: latency + auth tier. */
export function StatusLine({ meta }: { meta: ProxyMeta | null }) {
  if (!meta) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="secondary" className="font-mono">
        {meta.latencyMs} ms
      </Badge>
      <span>
        tier:{" "}
        <span className="font-mono text-foreground">{meta.tier}</span>
      </span>
    </div>
  );
}
