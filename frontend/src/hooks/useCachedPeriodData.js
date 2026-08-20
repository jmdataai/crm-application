import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Cached period fetcher — the main reason the tracker feels fast on a bad line.
 *
 * Three things it does:
 *
 * 1. STALE-WHILE-REVALIDATE. Every period response is kept in a module-level
 *    Map. Stepping back to a period you already viewed paints instantly from
 *    cache while a fresh copy loads behind it. Jayant clicking ◀ ▶ through
 *    weeks gets zero perceived latency after the first pass.
 *
 * 2. CANCELS STALE REQUESTS. Clicking the arrow five times fires five requests;
 *    without this the slowest one can land last and overwrite the newest data
 *    with old numbers. An AbortController per request plus a request-id guard
 *    means only the latest result is ever applied.
 *
 * 3. SURVIVES A COLD BACKEND. HuggingFace free tier sleeps; the first call
 *    after a nap can take 20-30s. `isStale` lets the page show real cached
 *    numbers with a subtle refreshing hint instead of a blank spinner.
 *
 * The cache is deliberately module-level, not React state: it persists across
 * unmounts, so navigating away and back is also instant.
 */

const cache = new Map();
const MAX_ENTRIES = 60;         // ~60 periods is plenty; keeps memory trivial
const TTL_MS = 5 * 60 * 1000;   // 5 min — activity data does not change fast

const keyOf = (endpoint, params) =>
  `${endpoint}|${params.granularity}|${params.anchor}|${params.user_id || 'all'}`;

const readCache = (k) => {
  const hit = cache.get(k);
  if (!hit) return null;
  return { data: hit.data, expired: Date.now() - hit.at > TTL_MS };
};

const writeCache = (k, data) => {
  cache.set(k, { data, at: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    // Map preserves insertion order — drop the oldest
    cache.delete(cache.keys().next().value);
  }
};

/** Clear everything — call after a write that invalidates the numbers. */
export const clearTrackerCache = () => cache.clear();

export default function useCachedPeriodData(fetcher, endpoint, params, { enabled = true } = {}) {
  const k = keyOf(endpoint, params);

  const initial = enabled ? readCache(k) : null;
  const [data,    setData]    = useState(initial?.data ?? null);
  const [loading, setLoading] = useState(enabled && !initial);
  const [isStale, setIsStale] = useState(Boolean(initial?.expired));
  const [error,   setError]   = useState('');

  const reqId  = useRef(0);
  const abortR = useRef(null);

  const load = useCallback(async ({ force = false } = {}) => {
    if (!enabled) return;

    const cached = readCache(k);
    if (cached && !force) {
      setData(cached.data);
      setLoading(false);
      setIsStale(cached.expired);
      if (!cached.expired) return;      // fresh enough — no network at all
    } else if (!cached) {
      setLoading(true);
    }

    // Cancel whatever is in flight; only the newest request may win
    if (abortR.current) abortR.current.abort();
    const controller = new AbortController();
    abortR.current = controller;

    const id = ++reqId.current;
    setError('');

    try {
      const res = await fetcher(params, { signal: controller.signal });
      if (id !== reqId.current) return;               // a newer request superseded us
      writeCache(k, res.data);
      setData(res.data);
      setIsStale(false);
    } catch (e) {
      if (controller.signal.aborted || id !== reqId.current) return;
      // Keep showing cached numbers on failure rather than blanking the page
      if (!readCache(k)) setData(null);
      setError(e?.response?.data?.detail || 'Could not load data.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [k, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    return () => { if (abortR.current) abortR.current.abort(); };
  }, [load]);

  return { data, loading, isStale, error, refetch: () => load({ force: true }) };
}
