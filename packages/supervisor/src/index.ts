export { resolveAgentTalkieDataDir } from "./paths.js";
export {
  readRelayLock,
  removeRelayLock,
  type RelayLock,
} from "./lockfile.js";
export { classifyRelayLock } from "./liveness.js";
export {
  ensureRelayRunning,
  stopRelay,
  getRelayStatus,
  type EnsureRelayOptions,
  type StopRelayOptions,
  type StopRelayResult,
  type RelayStatus,
} from "./ensure-relay.js";
