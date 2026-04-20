const DEMO_SPACE_SLUG = "dashboard";

import { BrowserSessionBridge } from "../bridge/browser-session-bridge.js";
import { deriveHttpOriginFromWsUrl } from "../bridge/derive-http-origin.js";
import {
  persistRelayGenerationIfMissing,
  probeRelayGenerationHealth,
  readBootstrapRelayGeneration,
} from "../bridge/relay-generation.js";
import { RELAY_GENERATION_KEY } from "../bridge/session-storage-keys.js";
import "../errors/talkie-error-bar.js";
import "../roster/talkie-roster.js";
import "../transcript/talkie-transcript.js";
import {
  DashboardStore,
  type OversightSpaceSummary,
} from "../store/dashboard-store.js";
import "../shell/connection-shell.js";

void (async () => {
  const wsUrl = import.meta.env.DEV
    ? "ws://127.0.0.1:18765"
    : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
  const bridge = new BrowserSessionBridge({ url: wsUrl });
  const shell = document.createElement("talkie-connection-shell");
  shell.classList.add("talkie-app__header");
  const app = document.getElementById("app");
  if (!app) {
    throw new Error("Missing #app mount element");
  }
  app.classList.add("talkie-app");

  const bodyRow = document.createElement("div");
  bodyRow.className = "talkie-app__body";

  const store = new DashboardStore();
  const errorBar = document.createElement("talkie-error-bar");
  errorBar.store = store;

  const roster = document.createElement("talkie-roster");
  const mainPanel = document.createElement("div");
  mainPanel.id = "talkie-main-panel";
  const transcript = document.createElement("talkie-transcript");
  transcript.store = store;
  mainPanel.appendChild(transcript);

  bodyRow.appendChild(roster);
  bodyRow.appendChild(mainPanel);

  app.appendChild(shell);
  app.appendChild(errorBar);
  app.appendChild(bodyRow);

  store.addListener(() => {
    roster.entries = Array.from(store.roster.values());
  });

  bridge.onProtocolError((w) => {
    store.pushProtocolError(w);
  });

  bridge.onTranscriptCatchup((row) => {
    store.appendTranscriptCatchup(row);
  });
  bridge.onEnvelope((env) => {
    store.appendTranscriptEnvelope(env);
    store.applyMetadataPatchFromEnvelope(env);
  });
  bridge.onCollaborationMetadata((msg) => {
    store.applyCollaborationMetadataWire(msg);
  });

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
    let selfSessionId: string;
    const resumed = await bridge.resumeFromStorage();
    if (!resumed) {
      const reg = await bridge.registerNewSession({
        displayName: "Human",
        runtime: "browser",
        workspaceLabel: "dashboard",
      });
      selfSessionId = reg.sessionId;
    } else {
      selfSessionId = resumed.sessionId;
    }
    const joined = await bridge.joinSpace({
      slug: DEMO_SPACE_SLUG,
      idempotencyKey: crypto.randomUUID(),
    });
    store.setActiveSpaceId(joined.spaceId);

    const pullSpaceSummary = async (): Promise<void> => {
      const res = await fetch(
        `${httpOrigin}/__agent-talkie/v1/oversight/space-summary?slug=${encodeURIComponent(DEMO_SPACE_SLUG)}`,
      );
      if (res.status === 200) {
        const summary = (await res.json()) as OversightSpaceSummary;
        store.hydrateFromSpaceSummary(summary, selfSessionId);
      }
    };

    await pullSpaceSummary();
    store.scheduleSnapshotRefresh(pullSpaceSummary, 10000);

    persistRelayGenerationIfMissing(
      gen ?? sessionStorage.getItem(RELAY_GENERATION_KEY) ?? "",
    );
  } catch {
    shell.healthState = "disconnected";
  }
})();
