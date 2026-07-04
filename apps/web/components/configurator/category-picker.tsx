"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  breadcrumb,
  getCachedTaxonomy,
  loadTaxonomy,
  searchTaxonomy,
  TAXONOMY_META,
  type TaxonomyIndex,
  type TaxonomyNode,
} from "@/lib/taxonomy";

const CATEGORY_PREFIX = "gid://shopify/TaxonomyCategory/";
const MAX_RESULTS = 50;

/**
 * The categories filter control: selected GIDs render as removable chips (with
 * friendly breadcrumbs when the GID resolves against the taxonomy dataset), plus
 * a searchable + browsable picker popover and a "paste GID manually" affordance.
 *
 * The taxonomy dataset is lazy-loaded on first open (module-level cached) so it
 * never lands in the initial bundle. The config still stores plain string GIDs —
 * this component is pure UI sugar over `filters.categories`.
 */
export function CategoryPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  // Selected GIDs, minus empty placeholders (the toggle seeds [""]).
  const selected = value.filter((g) => g.trim() !== "");

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<TaxonomyIndex | null>(getCachedTaxonomy);
  const [error, setError] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // Loading iff the popover is open, we have no data yet, and no error surfaced.
  const status: "idle" | "loading" | "error" = error
    ? "error"
    : open && !index
      ? "loading"
      : "idle";

  // Lazy-load once the popover first opens.
  useEffect(() => {
    if (!open || index) return;
    let cancelled = false;
    const controller = new AbortController();
    loadTaxonomy(controller.signal)
      .then((idx) => {
        if (!cancelled) setIndex(idx);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, index]);

  function add(gid: string) {
    if (selected.includes(gid)) return;
    onChange([...selected, gid]);
  }
  function remove(gid: string) {
    onChange(selected.filter((g) => g !== gid));
  }

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((gid) => (
            <CategoryChip
              key={gid}
              gid={gid}
              index={index}
              onRemove={() => remove(gid)}
            />
          ))}
        </ul>
      ) : null}

      {/* Picker trigger */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" size="sm">
              <Plus className="size-3.5" /> Add category
            </Button>
          }
        />
        <PopoverContent className="w-80 p-0" align="start">
          {status === "loading" ? (
            <PickerMessage>
              <Loader2 className="size-4 animate-spin" /> Loading taxonomy…
            </PickerMessage>
          ) : status === "error" ? (
            <PickerMessage tone="error">
              <AlertCircle className="size-4" /> Couldn&apos;t load the taxonomy.
              Paste a GID manually below.
            </PickerMessage>
          ) : index ? (
            <PickerBody
              index={index}
              selected={selected}
              onSelect={(gid) => add(gid)}
            />
          ) : (
            <PickerMessage>
              <Loader2 className="size-4 animate-spin" /> Loading…
            </PickerMessage>
          )}
          <div className="border-t border-border px-2 py-1.5 text-[11px] text-muted-foreground">
            Shopify Standard Product Taxonomy {TAXONOMY_META.tag}
          </div>
        </PopoverContent>
      </Popover>

      {/* Manual paste affordance */}
      <div>
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {showManual ? "Hide" : "Paste a GID manually"}
        </button>
        {showManual ? (
          <ManualGidInput
            onAdd={(gid) => {
              add(gid);
              setShowManual(false);
            }}
          />
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Shopify Standard Product Taxonomy {TAXONOMY_META.tag} —{" "}
        <span className="font-mono">github.com/Shopify/product-taxonomy</span>
      </p>
    </div>
  );
}

/* ── selected chip ─────────────────────────────────────────────────────── */

function CategoryChip({
  gid,
  index,
  onRemove,
}: {
  gid: string;
  index: TaxonomyIndex | null;
  onRemove: () => void;
}) {
  const node = index?.byGid.get(gid);
  const known = Boolean(node);
  const label = node
    ? breadcrumb(gid, index!.byGid)
    : gid.replace(CATEGORY_PREFIX, "…/");
  const invalid = gid.trim() !== "" && !gid.startsWith(CATEGORY_PREFIX);

  return (
    <li>
      <span
        className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs ${
          invalid
            ? "border-destructive/50 bg-destructive/5 text-destructive"
            : known
              ? "border-border bg-muted/40"
              : "border-border font-mono"
        }`}
        title={gid}
      >
        <span className="truncate">{label}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </span>
    </li>
  );
}

/* ── picker body: search + browse ──────────────────────────────────────── */

function PickerBody({
  index,
  selected,
  onSelect,
}: {
  index: TaxonomyIndex;
  selected: string[];
  onSelect: (gid: string) => void;
}) {
  const [query, setQuery] = useState("");
  // Browse cursor: null = top-level verticals; otherwise the parent GID we're inside.
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const searching = query.trim() !== "";
  const results = useMemo(
    () => (searching ? searchTaxonomy(index, query, MAX_RESULTS) : []),
    [index, query, searching],
  );

  const browseNodes: TaxonomyNode[] = searching
    ? []
    : index.childrenOf.get(browseParent) ?? [];
  const parentNode = browseParent ? index.byGid.get(browseParent) : undefined;

  const isSelected = useCallback(
    (gid: string) => selected.includes(gid),
    [selected],
  );

  return (
    <div className="flex flex-col">
      {/* Search box */}
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories…"
          spellCheck={false}
          className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      {/* Browse breadcrumb / back nav */}
      {!searching ? (
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 text-xs text-muted-foreground">
          <FolderTree className="size-3.5 shrink-0" />
          {browseParent ? (
            <>
              <button
                type="button"
                onClick={() =>
                  setBrowseParent(parentNode?.parentGid ?? null)
                }
                className="inline-flex items-center gap-0.5 rounded-sm hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" /> Back
              </button>
              <span className="mx-1 truncate" title={parentNode?.gid}>
                {parentNode ? breadcrumb(parentNode.gid, index.byGid) : ""}
              </span>
            </>
          ) : (
            <span>Browse {index.roots.length} verticals</span>
          )}
        </div>
      ) : null}

      {/* Results list */}
      <ul className="max-h-64 overflow-y-auto p-1" role="listbox">
        {searching ? (
          results.length === 0 ? (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              No categories match “{query.trim()}”.
            </li>
          ) : (
            results.map(({ node, fullName }) => (
              <ResultRow
                key={node.gid}
                primary={node.name}
                secondary={fullName}
                selected={isSelected(node.gid)}
                onClick={() => onSelect(node.gid)}
              />
            ))
          )
        ) : (
          browseNodes.map((node) => {
            const hasChildren = (index.childrenOf.get(node.gid)?.length ?? 0) > 0;
            return (
              <li key={node.gid} className="flex items-stretch gap-0.5">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected(node.gid)}
                  onClick={() => onSelect(node.gid)}
                  className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  {isSelected(node.gid) ? (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{node.name}</span>
                </button>
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => setBrowseParent(node.gid)}
                    aria-label={`Browse ${node.name}`}
                    className="flex shrink-0 items-center rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function ResultRow({
  primary,
  secondary,
  selected,
  onClick,
}: {
  primary: string;
  secondary: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
      >
        {selected ? (
          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
        ) : (
          <span className="mt-0.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm">{primary}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        </span>
      </button>
    </li>
  );
}

function PickerMessage({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-6 text-xs ${
        tone === "error" ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      {children}
    </div>
  );
}

/* ── manual GID input ──────────────────────────────────────────────────── */

function ManualGidInput({ onAdd }: { onAdd: (gid: string) => void }) {
  const [text, setText] = useState("");
  const gid = text.trim();
  const invalid = gid !== "" && !gid.startsWith(CATEGORY_PREFIX);
  const canAdd = gid.startsWith(CATEGORY_PREFIX) && gid.length > CATEGORY_PREFIX.length;

  function commit() {
    if (!canAdd) return;
    onAdd(gid);
    setText("");
  }

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          spellCheck={false}
          aria-invalid={invalid}
          placeholder={`${CATEGORY_PREFIX}…`}
          className={`font-mono text-xs ${invalid ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
        />
        <Button type="button" variant="outline" size="sm" disabled={!canAdd} onClick={commit}>
          Add
        </Button>
      </div>
      {invalid ? (
        <p className="text-xs text-destructive">
          Must start with{" "}
          <code className="font-mono">{CATEGORY_PREFIX}</code>
        </p>
      ) : null}
    </div>
  );
}
