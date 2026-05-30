/**
 * Map a WebSocket URL to an HTTP(S) origin for same-host health probes.
 */
export function deriveHttpOriginFromWsUrl(wsUrl: string): string {
  if (wsUrl.startsWith("ws://")) {
    return `http://${wsUrl.slice("ws://".length)}`;
  }
  if (wsUrl.startsWith("wss://")) {
    return `https://${wsUrl.slice("wss://".length)}`;
  }
  throw new Error(`Unsupported WebSocket URL scheme: ${wsUrl}`);
}
