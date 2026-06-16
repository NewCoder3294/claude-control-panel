import { useCallback, useEffect, useRef, useState } from "react";
import { peek, run, subscribe, write } from "./queryCache";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Force a fresh fetch (manual refresh), bypassing the cache. */
  reload: () => void;
  /** Replace data without a refetch; writes through the shared cache. */
  setData: (next: T) => void;
}

/**
 * Cache-first async data hook. On mount it serves cached data instantly (no
 * loading flash, no refetch) when present, so switching tabs and coming back
 * does not re-run an expensive fetch like the ~15s MCP health check. Data is
 * refreshed only by reload() or when a mutation invalidates the key.
 *
 * The cache is keyed by the fetcher reference, which must be stable across
 * renders (all call sites pass `api.xxx`). The key is captured once on first
 * render to stay robust even if a caller passes an inline fetcher.
 */
export function useAsync<T>(fetcher: () => Promise<T>): AsyncState<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const keyRef = useRef(fetcher);
  const key = keyRef.current;

  const cached = peek<T>(key);
  const [data, setDataState] = useState<T | null>(cached ? cached.data : null);
  const [loading, setLoading] = useState<boolean>(!cached);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const doFetch = useCallback(() => {
    setError(null);
    // Only show the full loading state when there is nothing to display yet.
    setLoading(peek<T>(key) === undefined);
    run<T>(key, fetcherRef.current)
      .then((result) => {
        if (mounted.current) {
          setDataState(result);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (mounted.current) {
          setError(cause instanceof Error ? cause.message : "Unknown error");
          setLoading(false);
        }
      });
  }, [key]);

  useEffect(() => {
    mounted.current = true;

    const unsub = subscribe(key, () => {
      if (!mounted.current) return;
      const current = peek<T>(key);
      if (current) {
        // Another consumer updated the value (or a write-through happened).
        setDataState(current.data);
        setLoading(false);
        setError(null);
      } else {
        // Key was invalidated by a mutation: refetch.
        doFetch();
      }
    });

    const present = peek<T>(key);
    if (present) {
      setDataState(present.data);
      setLoading(false);
    } else {
      doFetch();
    }

    return () => {
      mounted.current = false;
      unsub();
    };
  }, [key, doFetch]);

  const setData = useCallback(
    (next: T) => {
      // Write through so the value persists across navigation and other
      // consumers (e.g. sidebar badges) stay in sync.
      write<T>(key, next);
    },
    [key],
  );

  return { data, loading, error, reload: doFetch, setData };
}
