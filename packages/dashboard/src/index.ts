export {
  BrowserSessionBridge,
  type ConnectionHealthUiState,
  type StaleUiReason,
  type TranscriptCatchupRow,
} from "./bridge/browser-session-bridge.js";
export {
  RECONNECT_SECRET_KEY,
  RELAY_GENERATION_KEY,
  SESSION_ID_KEY,
} from "./bridge/session-storage-keys.js";
export {
  persistRelayGenerationIfMissing,
  probeRelayGenerationHealth,
  readBootstrapRelayGeneration,
} from "./bridge/relay-generation.js";
export { deriveHttpOriginFromWsUrl } from "./bridge/derive-http-origin.js";

import "./shell/connection-shell.js";

export { TalkieConnectionShell } from "./shell/connection-shell.js";

export const DASHBOARD_PACKAGE = "@agent-talkie/dashboard";
