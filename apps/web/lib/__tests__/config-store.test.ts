import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeConfigHash } from "../config-hash";
import {
  DEFAULT_CONFIG,
  PERSIST_DEBOUNCE_MS,
  STORAGE_KEY,
  getShareUrl,
  initConfigFromEnvironment,
  useConfigStore,
} from "../config-store";

function resetStore() {
  useConfigStore.getState().reset();
}

describe("config-store — default config", () => {
  beforeEach(resetStore);

  it("starts with a valid default config", () => {
    const { config, validation } = useConfigStore.getState();
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });
});

describe("config-store — setQuery / setFilter canonicalization", () => {
  beforeEach(resetStore);

  it("setQuery updates query and keeps validity", () => {
    useConfigStore.getState().setQuery("wireless headphones");
    expect(useConfigStore.getState().config.query).toBe("wireless headphones");
    expect(useConfigStore.getState().validation.valid).toBe(true);
  });

  it("setFilter adds a filter key", () => {
    useConfigStore.getState().setFilter("available", true);
    expect(useConfigStore.getState().config.filters).toEqual({ available: true });
  });

  it("setFilter with undefined removes just that key", () => {
    const { setFilter } = useConfigStore.getState();
    setFilter("available", true);
    setFilter("price", { max: 5000 });
    setFilter("available", undefined);
    expect(useConfigStore.getState().config.filters).toEqual({ price: { max: 5000 } });
  });

  it("removing the last filter key drops `filters` entirely", () => {
    const { setFilter } = useConfigStore.getState();
    setFilter("available", true);
    setFilter("available", undefined);
    expect(useConfigStore.getState().config.filters).toBeUndefined();
  });

  it("setPaginationLimit(undefined) removes pagination entirely", () => {
    useConfigStore.getState().setPaginationLimit(undefined);
    expect(useConfigStore.getState().config.pagination).toBeUndefined();
  });

  it("setContextField removes the field when set to empty string", () => {
    const { setContextField } = useConfigStore.getState();
    setContextField("intent", "gift");
    expect(useConfigStore.getState().config.context).toEqual({ intent: "gift" });
    setContextField("intent", "");
    expect(useConfigStore.getState().config.context).toBeUndefined();
  });

  it("setSavedCatalogSlug adds/removes without leaving an empty scope key", () => {
    const { setSavedCatalogSlug } = useConfigStore.getState();
    setSavedCatalogSlug("curated-2026");
    expect(useConfigStore.getState().config.scope).toEqual({
      type: "global",
      savedCatalogSlug: "curated-2026",
    });
    setSavedCatalogSlug(undefined);
    expect(useConfigStore.getState().config.scope).toEqual({ type: "global" });
  });
});

describe("config-store — searchMode transitions", () => {
  beforeEach(resetStore);

  it("text mode drops `like`", () => {
    useConfigStore.getState().setLikeItemId("gid://shopify/p/1");
    useConfigStore.getState().setSearchMode("text");
    const { config, searchMode } = useConfigStore.getState();
    expect(searchMode).toBe("text");
    expect(config.like).toBeUndefined();
    expect(config.query).toBe(DEFAULT_CONFIG.query);
  });

  it("image mode drops `query` and seeds an image_url like entry", () => {
    useConfigStore.getState().setQuery("sneakers");
    useConfigStore.getState().setSearchMode("image");
    const { config, searchMode } = useConfigStore.getState();
    expect(searchMode).toBe("image");
    expect(config.query).toBeUndefined();
    expect(config.like).toEqual([{ image_url: "" }]);
  });

  it("more-like-this mode drops `query` and seeds an id like entry", () => {
    useConfigStore.getState().setQuery("sneakers");
    useConfigStore.getState().setSearchMode("more-like-this");
    const { config, searchMode } = useConfigStore.getState();
    expect(searchMode).toBe("more-like-this");
    expect(config.query).toBeUndefined();
    expect(config.like).toEqual([{ id: "" }]);
  });

  it("multimodal mode keeps both query and an image like entry", () => {
    useConfigStore.getState().setSearchMode("multimodal");
    const { config, searchMode } = useConfigStore.getState();
    expect(searchMode).toBe("multimodal");
    expect(config.query).toBe(DEFAULT_CONFIG.query);
    expect(config.like).toEqual([{ image_url: "" }]);
  });

  it("loadConfig infers searchMode from the loaded config's shape", () => {
    useConfigStore.getState().loadConfig({
      version: 1,
      scope: { type: "global" },
      like: [{ id: "gid://shopify/p/1" }],
    });
    expect(useConfigStore.getState().searchMode).toBe("more-like-this");
  });
});

describe("config-store — hydration precedence", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    resetStore();
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
    window.location.hash = "";
  });

  it("URL hash wins over localStorage", () => {
    const hashConfig = {
      version: 1 as const,
      scope: { type: "global" as const },
      query: "from-hash",
    };
    const storageConfig = {
      version: 1 as const,
      scope: { type: "global" as const },
      query: "from-storage",
    };
    store[STORAGE_KEY] = JSON.stringify(storageConfig);
    window.location.hash = `#c=${encodeConfigHash(hashConfig)}`;

    initConfigFromEnvironment();

    expect(useConfigStore.getState().config.query).toBe("from-hash");
  });

  it("localStorage wins over the default when there is no hash", () => {
    const storageConfig = {
      version: 1 as const,
      scope: { type: "global" as const },
      query: "from-storage",
    };
    store[STORAGE_KEY] = JSON.stringify(storageConfig);
    window.location.hash = "";

    initConfigFromEnvironment();

    expect(useConfigStore.getState().config.query).toBe("from-storage");
  });

  it("falls back to the default config when neither hash nor localStorage is present", () => {
    initConfigFromEnvironment();
    expect(useConfigStore.getState().config).toEqual(DEFAULT_CONFIG);
  });

  it("ignores a malformed hash and falls through to localStorage", () => {
    const storageConfig = {
      version: 1 as const,
      scope: { type: "global" as const },
      query: "from-storage",
    };
    store[STORAGE_KEY] = JSON.stringify(storageConfig);
    window.location.hash = "#c=not-valid-base64url!!!";

    initConfigFromEnvironment();

    expect(useConfigStore.getState().config.query).toBe("from-storage");
  });
});

describe("config-store — hash-load does not clobber localStorage (#13)", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
    window.location.hash = "";
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a #c= hash-load leaves a pre-existing localStorage value intact until an explicit edit", () => {
    // The user has a saved config in localStorage.
    const saved = {
      version: 1 as const,
      scope: { type: "global" as const },
      query: "user-saved-work",
    };
    const savedRaw = JSON.stringify(saved);
    store[STORAGE_KEY] = savedRaw;

    // They open a share link whose hash carries a DIFFERENT config.
    const hashConfig = {
      version: 1 as const,
      scope: { type: "global" as const },
      query: "from-share-link",
    };
    window.location.hash = `#c=${encodeConfigHash(hashConfig)}`;

    initConfigFromEnvironment();
    // The store reflects the hash config...
    expect(useConfigStore.getState().config.query).toBe("from-share-link");

    // ...but after the debounce window, localStorage is STILL the saved value:
    // the hydration persist was suppressed (no silent clobber).
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS + 50);
    expect(store[STORAGE_KEY]).toBe(savedRaw);

    // Once the user makes a real edit, persistence resumes and overwrites.
    useConfigStore.getState().setQuery("edited-by-user");
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS + 50);
    const persisted = JSON.parse(store[STORAGE_KEY]) as { query?: string };
    expect(persisted.query).toBe("edited-by-user");
  });
});

describe("getShareUrl", () => {
  beforeEach(resetStore);

  it("produces a URL with a #c= hash decodable back to the current config", () => {
    useConfigStore.getState().setQuery("wireless headphones");
    const url = getShareUrl();
    expect(url).toContain("#c=");
    const hash = url.split("#c=")[1];
    expect(hash).not.toMatch(/[+/=]/);
  });
});
