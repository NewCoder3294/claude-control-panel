/**
 * Tiny reactive query cache, keyed by the fetcher function reference.
 *
 * Goals (see Context Map / MCP UX): data survives tab switches so navigating
 * away and back does NOT refetch (the MCP health check is ~15s). Refreshing is
 * explicit — a manual reload() or an invalidate() triggered by a mutation.
 *
 * Features: cache-first reads, in-flight request dedup, write-through updates,
 * and pub/sub so every mounted consumer (a view + the sidebar badges) stays in
 * sync when one of them updates or a mutation invalidates a key.
 */

type Fetcher<T> = () => Promise<T>;
type AnyFetcher = Fetcher<unknown>;

interface Entry {
  data: unknown;
  hasData: boolean;
  ts: number;
  inflight: Promise<unknown> | null;
}

const store = new Map<AnyFetcher, Entry>();
const subscribers = new Map<AnyFetcher, Set<() => void>>();

function entryFor(key: AnyFetcher): Entry {
  let e = store.get(key);
  if (!e) {
    e = { data: undefined, hasData: false, ts: 0, inflight: null };
    store.set(key, e);
  }
  return e;
}

function notify(key: AnyFetcher): void {
  const subs = subscribers.get(key);
  if (!subs) return;
  // Copy to tolerate unsubscribe during iteration.
  for (const cb of [...subs]) cb();
}

/** Current cached value, if present (ignores in-flight state). */
export function peek<T>(key: Fetcher<T>): { data: T; ts: number } | undefined {
  const e = store.get(key as AnyFetcher);
  if (!e || !e.hasData) return undefined;
  return { data: e.data as T, ts: e.ts };
}

/** Subscribe to changes for a key. Returns an unsubscribe function. */
export function subscribe(key: Fetcher<unknown>, cb: () => void): () => void {
  let set = subscribers.get(key);
  if (!set) {
    set = new Set();
    subscribers.set(key, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}

/** Write a value through to the cache and notify subscribers. */
export function write<T>(key: Fetcher<T>, data: T): void {
  const e = entryFor(key as AnyFetcher);
  e.data = data;
  e.hasData = true;
  e.ts = Date.now();
  notify(key as AnyFetcher);
}

/**
 * Run the fetcher with in-flight dedup. Concurrent callers for the same key
 * share one promise. On success the result is written to the cache.
 * Pass force=true to bypass an existing in-flight promise is NOT done here;
 * callers decide whether to fetch. `force` only matters for cache writes.
 */
export function run<T>(key: Fetcher<T>, fetcher: Fetcher<T>): Promise<T> {
  const e = entryFor(key as AnyFetcher);
  if (e.inflight) return e.inflight as Promise<T>;
  const p = fetcher()
    .then((data) => {
      e.data = data;
      e.hasData = true;
      e.ts = Date.now();
      e.inflight = null;
      notify(key as AnyFetcher);
      return data;
    })
    .catch((cause) => {
      e.inflight = null;
      throw cause;
    });
  e.inflight = p;
  return p;
}

/** Drop a key's cached data so its next consumer refetches; notify subscribers. */
export function invalidate(...keys: Fetcher<unknown>[]): void {
  for (const key of keys) {
    const e = store.get(key);
    if (e) {
      e.hasData = false;
      e.data = undefined;
      e.ts = 0;
    }
    notify(key);
  }
}
