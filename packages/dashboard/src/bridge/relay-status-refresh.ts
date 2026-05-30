export const RELAY_STOP_STATUS_SETTLE_MS = 1500;

export function scheduleRelayStopStatusRefreshes(
  refreshRelayStatus: () => void | Promise<void>,
): void {
  void refreshRelayStatus();
  globalThis.setTimeout(() => {
    void refreshRelayStatus();
  }, RELAY_STOP_STATUS_SETTLE_MS);
}
