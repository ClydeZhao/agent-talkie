/**
 * Synchronous in-memory idempotency guard keyed by string.
 * Callers that need async effects must wrap them (e.g. resolve a Promise before
 * calling `run`) or use a different deduplication primitive at the transport layer.
 */
export function createIdempotencyGuard() {
  const cache = new Map<string, unknown>();
  return {
    run<T>(key: string, fn: () => T): T {
      if (cache.has(key)) {
        return cache.get(key) as T;
      }
      const result = fn();
      cache.set(key, result as unknown);
      return result;
    },
  };
}
