"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { catalogConfigSchema } from "catalog-kit";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SAMPLE_CONFIGS } from "@/lib/sample-configs";

export interface ConfigValidation {
  ok: boolean;
  /** Parsed config when ok; undefined otherwise. */
  issues: Array<{ path: string; message: string }>;
}

/** Validate raw editor text against catalogConfigSchema (JSON parse + zod). */
export function validateConfigText(text: string): ConfigValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      issues: [{ path: "(json)", message: err instanceof Error ? err.message : "Invalid JSON" }],
    };
  }
  const result = catalogConfigSchema.safeParse(parsed);
  if (result.success) return { ok: true, issues: [] };
  return {
    ok: false,
    issues: result.error.issues.map((i) => ({
      path: i.path.length > 0 ? i.path.join(".") : "(root)",
      message: i.message,
    })),
  };
}

/**
 * Search-tool config editor: a JSON textarea with live zod validation and a
 * sample-config dropdown. Validation issues render under the editor with their
 * JSON paths; the parent disables Run when invalid.
 */
export function ConfigEditor({
  value,
  onChange,
  validation,
}: {
  value: string;
  onChange: (next: string) => void;
  validation: ConfigValidation;
}) {
  const invalid = !validation.ok;

  const samplesById = useMemo(
    () => new Map(SAMPLE_CONFIGS.map((s, i) => [String(i), s])),
    [],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="config-editor">Config (JSON)</Label>
        <Select
          onValueChange={(id) => {
            const sample = samplesById.get(String(id));
            if (sample) onChange(JSON.stringify(sample.config, null, 2));
          }}
        >
          <SelectTrigger size="sm" className="w-auto min-w-52">
            <SelectValue placeholder="Load a sample…" />
          </SelectTrigger>
          <SelectContent>
            {SAMPLE_CONFIGS.map((s, i) => (
              <SelectItem key={i} value={String(i)}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Textarea
        id="config-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={`min-h-[24rem] font-mono text-xs ${invalid ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
        aria-invalid={invalid}
      />

      {invalid ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="mb-1.5 inline-flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-3.5" />
            {validation.issues.length} validation{" "}
            {validation.issues.length === 1 ? "issue" : "issues"}
          </p>
          <ul className="list-inside list-disc space-y-1 font-mono">
            {validation.issues.map((issue, i) => (
              <li key={i}>
                <span className="opacity-70">{issue.path}</span>: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Valid against <code className="font-mono">catalogConfigSchema</code>.
        </p>
      )}
    </div>
  );
}
