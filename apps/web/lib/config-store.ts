import { create } from "zustand";
import type { z } from "zod";
import { catalogConfigSchema, type CatalogConfig } from "catalog-kit";

/** Element type of `CatalogConfig["like"]` — mirrors catalog-kit's `ConfigLikeEntry`. */
type ConfigLikeEntry = NonNullable<CatalogConfig["like"]>[number];
import { decodeConfigHash, encodeConfigHash } from "./config-hash";

/**
 * The configurator's zustand store — a single `CatalogConfig` plus derived
 * zod validation, driven by a set of canonicalizing actions (Task 4.1).
 *
 * Canonical output: every action leaves the config free of empty-string
 * keys, empty objects, and empty arrays (e.g. removing the last filter drops
 * `filters` entirely). This keeps the JSON emitted by the live output panel
 * (Task 4.2) and `getShareUrl()` portable and diff-friendly.
 *
 * Persistence: the store subscribes to its own changes and debounce-writes
 * to `localStorage` (`STORAGE_KEY`). On the client, `initConfigFromEnvironment()`
 * hydrates in this precedence order: URL hash (`#c=<base64url>`) wins over
 * localStorage wins over the default config.
 */

export type SearchMode = "text" | "image" | "more-like-this" | "multimodal";

export const STORAGE_KEY = "catalog-kit:config";
const HASH_PREFIX = "#c=";
export const PERSIST_DEBOUNCE_MS = 300;

/** The default config: a plain (empty) text search over the Global Catalog. */
export const DEFAULT_CONFIG: CatalogConfig = {
  version: 1,
  scope: { type: "global" },
  // A real default query (not just a placeholder) so a fresh "Run in playground"
  // always has a non-empty query and never trips the API's "A query is required".
  query: "wireless noise-cancelling headphones",
  pagination: { limit: 12 },
};

export interface ConfigValidation {
  valid: boolean;
  issues: z.ZodIssue[];
}

function validate(config: CatalogConfig): ConfigValidation {
  const result = catalogConfigSchema.safeParse(config);
  return result.success
    ? { valid: true, issues: [] }
    : { valid: false, issues: result.error.issues };
}

/** Infers the search-mode segmented-control value from a config's shape. */
export function inferSearchMode(config: CatalogConfig): SearchMode {
  const hasQuery = config.query !== undefined && config.query !== "";
  const like = config.like;
  const likeKind = like?.[0]
    ? "id" in like[0]
      ? "id"
      : "image" in like[0] || "image_url" in like[0]
        ? "image"
        : undefined
    : undefined;

  if (likeKind === "id") return "more-like-this";
  if (likeKind === "image" && hasQuery) return "multimodal";
  if (likeKind === "image") return "image";
  return "text";
}

// ── canonicalization helpers ─────────────────────────────────────────────

/** Removes a key from an object, returning `undefined` in its place. */
function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const clone = { ...obj };
  delete clone[key];
  return clone;
}

/** Drops a `filters` sub-key; removes `filters` entirely if now empty. */
function cleanFilters(
  filters: NonNullable<CatalogConfig["filters"]> | undefined,
): CatalogConfig["filters"] {
  if (!filters) return undefined;
  const cleaned = { ...filters };
  for (const key of Object.keys(cleaned) as (keyof typeof cleaned)[]) {
    const value = cleaned[key];
    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete cleaned[key];
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

/** Drops empty-string/undefined keys from `context`; removes it if now empty. */
function cleanContext(
  context: NonNullable<CatalogConfig["context"]> | undefined,
): CatalogConfig["context"] {
  if (!context) return undefined;
  const cleaned = { ...context };
  for (const key of Object.keys(cleaned) as (keyof typeof cleaned)[]) {
    if (cleaned[key] === undefined || cleaned[key] === "") {
      delete cleaned[key];
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

/** Re-derives `validation` and returns a fully canonical config. */
function canonicalize(config: CatalogConfig): CatalogConfig {
  const next: CatalogConfig = { ...config };

  if (next.query === undefined) {
    // leave as-is; caller decides whether "" is meaningful for the mode
  }
  next.filters = cleanFilters(next.filters);
  next.context = cleanContext(next.context);
  if (next.like !== undefined && next.like.length === 0) {
    next.like = undefined;
  }

  // Strip undefined keys so JSON.stringify never emits `"key":undefined`
  // (harmless either way, but keeps the object tidy for equality checks).
  const cleaned = { ...next };
  for (const key of Object.keys(cleaned) as (keyof CatalogConfig)[]) {
    if (cleaned[key] === undefined) delete cleaned[key];
  }
  return cleaned as CatalogConfig;
}

export interface ConfigStoreState {
  config: CatalogConfig;
  searchMode: SearchMode;
  validation: ConfigValidation;
  // Bumped whenever the whole config is replaced (loadConfig/reset). Lets the
  // filters panel clear its local "which rows are open" state on a fresh config.
  configEpoch: number;

  setQuery: (query: string) => void;
  setSearchMode: (mode: SearchMode) => void;
  setLikeImageUrl: (url: string) => void;
  setLikeItemId: (id: string) => void;
  setScope: (scope: CatalogConfig["scope"]) => void;
  setSavedCatalogSlug: (slug: string | undefined) => void;
  setContextField: (
    key: keyof NonNullable<CatalogConfig["context"]>,
    value: string | undefined,
  ) => void;
  setFilter: <K extends keyof NonNullable<CatalogConfig["filters"]>>(
    key: K,
    value: NonNullable<CatalogConfig["filters"]>[K] | undefined,
  ) => void;
  setPaginationLimit: (limit: number | undefined) => void;
  setView: (view: CatalogConfig["view"]) => void;
  loadConfig: (config: CatalogConfig) => void;
  reset: () => void;
}

function withNextConfig(
  set: (fn: (state: ConfigStoreState) => Partial<ConfigStoreState>) => void,
  updater: (config: CatalogConfig) => CatalogConfig,
) {
  set((state) => {
    const next = canonicalize(updater(state.config));
    return { config: next, validation: validate(next) };
  });
}

export const useConfigStore = create<ConfigStoreState>((set) => ({
  config: DEFAULT_CONFIG,
  searchMode: inferSearchMode(DEFAULT_CONFIG),
  validation: validate(DEFAULT_CONFIG),
  configEpoch: 0,

  setQuery: (query) => {
    withNextConfig(set, (config) => ({ ...config, query }));
  },

  setSearchMode: (mode) => {
    set((state) => {
      let config: CatalogConfig = { ...state.config };
      switch (mode) {
        case "text":
          config = omit(config, "like") as CatalogConfig;
          if (config.query === undefined) config.query = "";
          break;
        case "image": {
          config = omit(config, "query") as CatalogConfig;
          const existing = firstImageUrl(config.like);
          config.like = [{ image_url: existing ?? "" }];
          break;
        }
        case "more-like-this": {
          config = omit(config, "query") as CatalogConfig;
          const existing = firstItemId(config.like);
          config.like = [{ id: existing ?? "" }];
          break;
        }
        case "multimodal": {
          if (config.query === undefined) config.query = "";
          const existing = firstImageUrl(config.like);
          config.like = [{ image_url: existing ?? "" }];
          break;
        }
      }
      const next = canonicalize(config);
      return { config: next, validation: validate(next), searchMode: mode };
    });
  },

  setLikeImageUrl: (url) => {
    withNextConfig(set, (config) => ({
      ...config,
      like: [{ image_url: url } satisfies ConfigLikeEntry],
    }));
  },

  setLikeItemId: (id) => {
    withNextConfig(set, (config) => ({
      ...config,
      like: [{ id } satisfies ConfigLikeEntry],
    }));
  },

  setScope: (scope) => {
    withNextConfig(set, (config) => ({ ...config, scope }));
  },

  setSavedCatalogSlug: (slug) => {
    withNextConfig(set, (config) => {
      if (config.scope.type !== "global") return config;
      const scope = { ...config.scope };
      if (slug === undefined || slug === "") {
        delete scope.savedCatalogSlug;
      } else {
        scope.savedCatalogSlug = slug;
      }
      return { ...config, scope };
    });
  },

  setContextField: (key, value) => {
    withNextConfig(set, (config) => {
      const context = { ...(config.context ?? {}) };
      if (value === undefined || value === "") {
        delete context[key];
      } else {
        (context as Record<string, string>)[key] = value;
      }
      return { ...config, context };
    });
  },

  setFilter: (key, value) => {
    withNextConfig(set, (config) => {
      const filters = { ...(config.filters ?? {}) };
      if (value === undefined) {
        delete filters[key];
      } else {
        filters[key] = value;
      }
      return { ...config, filters };
    });
  },

  setPaginationLimit: (limit) => {
    withNextConfig(set, (config) => {
      if (limit === undefined) {
        return omit(config, "pagination") as CatalogConfig;
      }
      return { ...config, pagination: { ...config.pagination, limit } };
    });
  },

  setView: (view) => {
    withNextConfig(set, (config) => {
      if (view === undefined) return omit(config, "view") as CatalogConfig;
      return { ...config, view };
    });
  },

  loadConfig: (config) => {
    const next = canonicalize(config);
    set((s) => ({
      config: next,
      validation: validate(next),
      searchMode: inferSearchMode(next),
      configEpoch: s.configEpoch + 1,
    }));
  },

  reset: () => {
    set((s) => ({
      config: DEFAULT_CONFIG,
      validation: validate(DEFAULT_CONFIG),
      searchMode: inferSearchMode(DEFAULT_CONFIG),
      configEpoch: s.configEpoch + 1,
    }));
  },
}));

function firstImageUrl(like: CatalogConfig["like"]): string | undefined {
  const entry = like?.[0];
  if (entry && "image_url" in entry) return entry.image_url;
  return undefined;
}

function firstItemId(like: CatalogConfig["like"]): string | undefined {
  const entry = like?.[0];
  if (entry && "id" in entry) return entry.id;
  return undefined;
}

// ── persistence: localStorage (debounced) + URL hash ─────────────────────

let persistTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * When the initial config was hydrated from a `#c=<hash>` share link, the very
 * first store change is that hydration itself — NOT a user edit. Persisting it
 * would clobber whatever the user had previously saved in localStorage (data
 * loss). We therefore skip the first persist after a hash-load and only start
 * writing back once the user actually edits the config. Exposed for tests.
 */
let suppressNextPersist = false;

/** Suppress the next debounced persist (call before hydrating from a URL hash). */
export function suppressNextPersistForHashLoad(): void {
  suppressNextPersist = true;
}

function persistToLocalStorage(config: CatalogConfig) {
  if (typeof window === "undefined") return;
  if (suppressNextPersist) {
    // Consume the flag: this change is the hash hydration, not a user edit.
    // The next change (a real edit) will persist normally and overwrite.
    suppressNextPersist = false;
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // storage full/unavailable — persistence is best-effort
    }
  }, PERSIST_DEBOUNCE_MS);
}

if (typeof window !== "undefined") {
  useConfigStore.subscribe((state) => {
    persistToLocalStorage(state.config);
  });
}

function readLocalStorageConfig(): CatalogConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const result = catalogConfigSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function readUrlHashConfig(): CatalogConfig | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return null;
  return decodeConfigHash(hash.slice(HASH_PREFIX.length));
}

/**
 * Hydrates the store on the client in precedence order: URL hash wins over
 * localStorage wins over the default config. Call once from the configurator
 * page (client-side only — a no-op on the server).
 */
export function initConfigFromEnvironment(): void {
  if (typeof window === "undefined") return;
  const fromHash = readUrlHashConfig();
  if (fromHash) {
    // Guard against clobbering the user's saved localStorage: the persist
    // triggered by this hydration is suppressed (see suppressNextPersist).
    suppressNextPersistForHashLoad();
    useConfigStore.getState().loadConfig(fromHash);
    return;
  }
  const fromStorage = readLocalStorageConfig();
  if (fromStorage) {
    useConfigStore.getState().loadConfig(fromStorage);
  }
}

/** Returns the current page URL with a `#c=<base64url>` hash for the current config. */
export function getShareUrl(): string {
  const config = useConfigStore.getState().config;
  const hash = encodeConfigHash(config);
  if (typeof window === "undefined") return `${HASH_PREFIX}${hash}`;
  const url = new URL(window.location.href);
  url.hash = `c=${hash}`;
  return url.toString();
}
