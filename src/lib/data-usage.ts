// Lightweight client-side data usage tracker via PerformanceObserver.
// Aggregates network transfer size & request count across the session.

type Stats = { count: number; bytes: number; byType: Record<string, { count: number; bytes: number }> };

const stats: Stats = { count: 0, bytes: 0, byType: {} };
const listeners = new Set<(s: Stats) => void>();

function notify() {
  const snapshot: Stats = {
    count: stats.count,
    bytes: stats.bytes,
    byType: { ...stats.byType },
  };
  listeners.forEach((fn) => fn(snapshot));
}

function record(entry: PerformanceResourceTiming) {
  const size = entry.transferSize || entry.encodedBodySize || 0;
  stats.count += 1;
  stats.bytes += size;
  const type = (entry.initiatorType || "other") as string;
  if (!stats.byType[type]) stats.byType[type] = { count: 0, bytes: 0 };
  stats.byType[type].count += 1;
  stats.byType[type].bytes += size;
}

let started = false;
export function startDataUsageTracker() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    // Backfill existing entries
    performance.getEntriesByType("resource").forEach((e) => record(e as PerformanceResourceTiming));
    const obs = new PerformanceObserver((list) => {
      list.getEntries().forEach((e) => record(e as PerformanceResourceTiming));
      notify();
    });
    obs.observe({ type: "resource", buffered: true });
    notify();
  } catch {
    /* PerformanceObserver unsupported */
  }
}

export function subscribeDataUsage(fn: (s: Stats) => void) {
  listeners.add(fn);
  fn({ count: stats.count, bytes: stats.bytes, byType: { ...stats.byType } });
  return () => listeners.delete(fn);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
