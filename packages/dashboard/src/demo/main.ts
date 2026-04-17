const DEMO_SPACE_SLUG = "dashboard";

import { BrowserSessionBridge } from "../bridge/browser-session-bridge.js";
import { deriveHttpOriginFromWsUrl } from "../bridge/derive-http-origin.js";
import {
  persistRelayGenerationIfMissing,
  probeRelayGenerationHealth,
  readBootstrapRelayGeneration,
} from "../bridge/relay-generation.js";
import { RELAY_GENERATION_KEY } from "../bridge/session-storage-keys.js";
import "../shell/connection-shell.js";

void (async () => {
  const wsUrl = "ws://127.0.0.1:18765";
  const bridge = new BrowserSessionBridge({ url: wsUrl });
  const shell = document.createElement("talkie-connection-shell");
  const app = document.getElementById("app");
  if (!app) {
    throw new Error("Missing #app mount element");
  }
  app.appendChild(shell);

  bridge.onConnectionHealthChange((s) => {
    shell.healthState = s;
  });

  bridge.onStaleUiChange(() => {
    shell.showRefreshBanner = bridge.getStaleUiReason() !== null;
  });

  const gen = readBootstrapRelayGeneration();
  if (gen !== null) {
    sessionStorage.setItem(RELAY_GENERATION_KEY, gen);
  }

  const httpOrigin = deriveHttpOriginFromWsUrl(wsUrl);
  if (
    gen !== null &&
    (await probeRelayGenerationHealth(httpOrigin, gen)) === false
  ) {
    shell.showRefreshBanner = true;
    bridge.notifyRelayGenerationStale();
    return;
  }

  window.addEventListener("beforeunload", () => {
    bridge.close();
  });

  try {
    await bridge.connect({ autoReconnect: true });
    const resumed = await bridge.resumeFromStorage();
    if (!resumed) {
      await bridge.registerNewSession({
        displayName: "Human",
        runtime: "browser",
        workspaceLabel: "dashboard",
      });
    }
    await bridge.joinSpace({
      slug: DEMO_SPACE_SLUG,
      idempotencyKey: crypto.randomUUID(),
    });
    persistRelayGenerationIfMissing(
      gen ?? sessionStorage.getItem(RELAY_GENERATION_KEY) ?? "",
    );
  } catch {
    shell.healthState = "disconnected";
  }
})();
