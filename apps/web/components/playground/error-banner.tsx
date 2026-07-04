import { AlertCircle } from "lucide-react";
import { friendlyErrorHeadline, type ProxyError } from "./shared";

/**
 * Red banner for proxy errors. Leads with a friendly, human sentence mapped from
 * the error `code` (finding #19), keeps the raw code as small secondary text,
 * and lists the zod issues on a 400 INVALID_CONFIG.
 */
export function ErrorBanner({ error }: { error: ProxyError }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-2">
          <div className="space-y-0.5">
            <p className="font-medium">{friendlyErrorHeadline(error.code)}</p>
            <p className="text-xs opacity-70">
              <span className="font-mono">{error.code}</span>
              {error.message ? ` — ${error.message}` : null}
            </p>
          </div>

          {error.issues && error.issues.length > 0 ? (
            <ul className="list-inside list-disc space-y-1 font-mono text-xs">
              {error.issues.map((issue, i) => (
                <li key={i}>
                  <span className="opacity-70">
                    {issue.path && issue.path.length > 0
                      ? issue.path.join(".")
                      : "(root)"}
                  </span>
                  : {issue.message}
                </li>
              ))}
            </ul>
          ) : null}

          {error.retryAfterSeconds ? (
            <p className="text-xs">Retry after {error.retryAfterSeconds}s.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
