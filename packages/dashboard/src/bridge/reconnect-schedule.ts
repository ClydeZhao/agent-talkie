/**
 * Exponential backoff with jitter for WebSocket reconnect (CONN-02 / D-09).
 * `attemptIndex` is 0-based; each failed close schedules the next attempt with a higher index.
 */
export function nextReconnectDelayMs(attemptIndex: number): number {
  const base = Math.min(30000, 1000 * 2 ** attemptIndex);
  return base + Math.floor(Math.random() * 301);
}
