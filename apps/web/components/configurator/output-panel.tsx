"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Play, RotateCcw } from "lucide-react";
import { buildSearchArguments, CatalogError } from "catalog-kit";
import { useConfigStore } from "@/lib/config-store";
import { encodeConfigHash } from "@/lib/config-hash";
import { generateSnippet } from "@/lib/generate-snippet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/playground/copy-button";

/**
 * Right panel (sticky) — live output. Tabs between the CatalogConfig JSON, the
 * exact `buildSearchArguments` wire payload (or the validation issues when the
 * config is invalid), and the generated standalone code snippet. Action buttons
 * run the config in the playground, copy it, copy the code, or download a preset.
 */

type OutputTab = "config" | "wire" | "code";

export function OutputPanel() {
  const config = useConfigStore((s) => s.config);
  const validation = useConfigStore((s) => s.validation);
  const reset = useConfigStore((s) => s.reset);
  const [tab, setTab] = useState<OutputTab>("config");

  const configName = config.name ?? "";
  const setName = (name: string) => {
    // `name` lives on the config directly; reuse loadConfig to keep it canonical.
    const next = { ...config };
    if (name.trim() === "") delete next.name;
    else next.name = name;
    useConfigStore.getState().loadConfig(next);
  };

  const configJson = useMemo(() => JSON.stringify(config, null, 2), [config]);

  const wire = useMemo(() => {
    try {
      const args = buildSearchArguments(config);
      return { ok: true as const, json: JSON.stringify(args, null, 2) };
    } catch (err) {
      const issues =
        err instanceof CatalogError && Array.isArray(err.messages)
          ? err.messages
          : [{ message: err instanceof Error ? err.message : String(err) }];
      return { ok: false as const, issues };
    }
  }, [config]);

  const snippet = useMemo(() => generateSnippet(config), [config]);

  const playgroundHref = `/playground#c=${encodeConfigHash(config)}`;
  const downloadName = `${config.name?.trim() || "my-catalog"}.config.json`;

  function downloadPreset() {
    const blob = new Blob([configJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    a.click();
    URL.revokeObjectURL(url);
  }

  function runInPlayground() {
    // Navigate to the playground with the config in the #c= hash; the
    // playground decodes it on mount and prefills its editor.
    window.location.href = playgroundHref;
  }

  return (
    <section className="space-y-4 lg:sticky lg:top-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Live output</h2>
        {validation.valid ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="size-3" /> Valid
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="size-3" />
            {validation.issues.length}{" "}
            {validation.issues.length === 1 ? "issue" : "issues"}
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="config-name" className="text-xs text-muted-foreground">
            Config name
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs text-muted-foreground"
            onClick={reset}
            title="Clear to a minimal global text search (version 1, empty query, limit 12)"
          >
            <RotateCcw className="size-3.5" /> New / Reset
          </Button>
        </div>
        <Input
          id="config-name"
          value={configName}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-catalog"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as OutputTab)}>
        <TabsList>
          <TabsTrigger value="config">Config JSON</TabsTrigger>
          <TabsTrigger value="wire">Wire arguments</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "config" ? (
        <CodeBlock code={configJson} copyLabel="Copy config" />
      ) : null}

      {tab === "wire" ? (
        wire.ok ? (
          <CodeBlock code={wire.json} copyLabel="Copy wire args" />
        ) : (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <p className="mb-1.5 inline-flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-3.5" />
              Cannot build wire arguments — fix these issues:
            </p>
            <ul className="list-inside list-disc space-y-1 font-mono">
              {wire.issues.map((issue, i) => {
                const withPath = issue as {
                  path?: (string | number)[];
                  message?: string;
                };
                const path = withPath.path?.length
                  ? withPath.path.join(".")
                  : "(root)";
                return (
                  <li key={i}>
                    <span className="opacity-70">{path}</span>:{" "}
                    {withPath.message ?? "invalid"}
                  </li>
                );
              })}
            </ul>
          </div>
        )
      ) : null}

      {tab === "code" ? (
        <CodeBlock code={snippet} copyLabel="Copy code" language="ts" />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          onClick={runInPlayground}
          disabled={!validation.valid}
          title={
            validation.valid
              ? undefined
              : "Fix validation issues to run in the playground"
          }
        >
          <Play className="size-4" /> Run in playground
        </Button>
        <CopyButton value={configJson} label="Copy config" />
        <CopyButton value={snippet} label="Copy code" />
        <Button type="button" variant="outline" size="sm" onClick={downloadPreset}>
          <Download className="size-3.5" /> Download preset
        </Button>
      </div>
    </section>
  );
}

/** A monospace code block with an overlaid copy button. */
function CodeBlock({
  code,
  copyLabel,
  language,
}: {
  code: string;
  copyLabel: string;
  language?: string;
}) {
  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-10">
        <CopyButton value={code} label={copyLabel} />
      </div>
      <pre
        className="max-h-[28rem] overflow-auto rounded-lg border border-border bg-muted/40 p-3 pt-11 text-xs"
        data-language={language}
      >
        <code className="font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}
