/**
 * BroadcastChannel adapter for react-query — keeps multiple tabs of the same
 * origin in sync.
 *
 * When tab A invalidates a query (or sets data), this adapter forwards the
 * invalidation to a BroadcastChannel; sibling tabs receive the message and
 * call `invalidateQueries({ queryKey, exact: true })`, which re-fetches via
 * each tab's own queryFn.
 *
 * Why hand-rolled instead of @tanstack/query-broadcast-client-experimental:
 *   - The library is marked experimental; we'd rather own ~25 LOC than depend
 *     on it for a trivial fan-out.
 *   - We only need the invalidate path; setQueryData fan-out would require
 *     serializing arbitrary T which we avoid.
 *
 * Failure modes:
 *   - BroadcastChannel unsupported (very old Safari): silently no-op. Tabs
 *     will converge on next focus refetch via the default 5min staleTime.
 *   - The adapter must be installed exactly once at app boot; calling
 *     `installQueryClientBroadcast()` multiple times is idempotent.
 */
import type { QueryClient } from '@tanstack/react-query';

const CHANNEL_NAME = 'nasun:rq';
let installed = false;

export function installQueryClientBroadcast(queryClient: QueryClient): void {
  if (installed) return;
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  installed = true;

  const channel = new BroadcastChannel(CHANNEL_NAME);

  // Echo guard: don't re-broadcast invalidations that we received via the
  // channel ourselves.
  let lastReceivedKey: string | null = null;

  queryClient.getQueryCache().subscribe((event) => {
    if (!event) return;
    if (event.type !== 'updated') return;
    const action = (event as { action?: { type?: string } }).action;
    if (action?.type !== 'invalidate') return;
    const queryKey = event.query.queryKey;
    if (!queryKey || queryKey.length === 0) return;
    const serialized = JSON.stringify(queryKey);
    if (serialized === lastReceivedKey) return;
    try {
      channel.postMessage({ type: 'invalidate', queryKey });
    } catch {
      // ignore (channel closed)
    }
  });

  channel.onmessage = (e: MessageEvent<{ type?: string; queryKey?: unknown }>) => {
    const data = e.data;
    if (!data || data.type !== 'invalidate' || !Array.isArray(data.queryKey)) return;
    lastReceivedKey = JSON.stringify(data.queryKey);
    queryClient.invalidateQueries({ queryKey: data.queryKey as unknown[], exact: true });
    // Reset echo guard shortly after so the same key can be invalidated locally next time.
    setTimeout(() => {
      if (lastReceivedKey === JSON.stringify(data.queryKey)) lastReceivedKey = null;
    }, 100);
  };
}
