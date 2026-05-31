// MGMT-02 invite: N/A for localhost v2.0 per phase 11 CONTEXT D-06; sessions join via adapter/CLI.

import {
  orchestratorClearPayloadSchema,
  orchestratorDesignatePayloadSchema,
} from "@agent-talkie/protocol";
import { mountDashboardAppShell } from "../app/dashboard-app-shell.js";
import { BrowserSessionBridge } from "../bridge/browser-session-bridge.js";
import { connectJoinDashboardSession } from "../bridge/dashboard-session-startup.js";
import { deriveHttpOriginFromWsUrl } from "../bridge/derive-http-origin.js";
import {
  persistRelayGenerationIfMissing,
  probeRelayGenerationHealth,
  readBootstrapRelayGeneration,
} from "../bridge/relay-generation.js";
import { scheduleRelayStopStatusRefreshes } from "../bridge/relay-status-refresh.js";
import { RELAY_GENERATION_KEY } from "../bridge/session-storage-keys.js";
import "../errors/talkie-error-bar.js";
import { TalkieTranscript } from "../transcript/talkie-transcript.js";
import {
  DashboardStore,
  type OversightSpaceSummary,
} from "../store/dashboard-store.js";

void (async () => {
  const wsUrl = import.meta.env.DEV
    ? "ws://127.0.0.1:18765"
    : `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
  const bridge = new BrowserSessionBridge({ url: wsUrl });

  const app = document.getElementById("app");
  if (!app) {
    throw new Error("Missing #app mount element");
  }

  const store = new DashboardStore();
  const httpOrigin = deriveHttpOriginFromWsUrl(wsUrl);
  const {
    picker,
    connectionShell: shell,
    roster,
    searchPanel,
    diagnosticsPanel,
    metadataEditor,
  } = mountDashboardAppShell({
    mount: app,
    store,
    bridge,
    httpOrigin,
  });

  roster.addEventListener("talkie-select-send-target", (ev) => {
    const sid = (ev as CustomEvent<{ sessionId: string }>).detail.sessionId;
    store.toggleSendTargetSession(sid);
  });

  roster.addEventListener("talkie-orchestrate-designate", (ev) => {
    const sid = (ev as CustomEvent<{ sessionId: string }>).detail.sessionId;
    const version = bridge.getNegotiatedEnvelopeVersion();
    const sessionId = bridge.getRegisteredSessionId();
    const spaceId = store.activeSpaceId;
    if (version === null || sessionId === null || spaceId === null) {
      return;
    }
    const payload = orchestratorDesignatePayloadSchema.parse({
      orchestratorSessionId: sid,
    });
    bridge.sendEnvelope({
      version,
      id: crypto.randomUUID(),
      sessionId,
      kind: "control",
      type: "orchestrator.designate",
      payload,
      idempotencyKey: crypto.randomUUID(),
      spaceId,
    });
  });

  roster.addEventListener("talkie-orchestrate-clear", () => {
    const version = bridge.getNegotiatedEnvelopeVersion();
    const sessionId = bridge.getRegisteredSessionId();
    const spaceId = store.activeSpaceId;
    if (version === null || sessionId === null || spaceId === null) {
      return;
    }
    const payload = orchestratorClearPayloadSchema.parse({});
    bridge.sendEnvelope({
      version,
      id: crypto.randomUUID(),
      sessionId,
      kind: "control",
      type: "orchestrator.clear",
      payload,
      idempotencyKey: crypto.randomUUID(),
      spaceId,
    });
  });

  roster.addEventListener("talkie-metadata-edit", (ev) => {
    const sid = (ev as CustomEvent<{ sessionId: string }>).detail.sessionId;
    const row = store.roster.get(sid);
    const spaceId = store.activeSpaceId;
    if (!row || spaceId === null) {
      return;
    }
    metadataEditor.row = row;
    metadataEditor.spaceId = spaceId;
    metadataEditor.open = true;
  });

  roster.addEventListener("talkie-membership-remove", (ev) => {
    const targetSessionId = (ev as CustomEvent<{ sessionId: string }>).detail
      .sessionId;
    const version = bridge.getNegotiatedEnvelopeVersion();
    const sessionId = bridge.getRegisteredSessionId();
    const spaceId = store.activeSpaceId;
    if (version === null || sessionId === null || spaceId === null) {
      return;
    }
    bridge.sendMembershipRemove({
      spaceId,
      targetSessionId,
      idempotencyKey: crypto.randomUUID(),
    });
  });

  app.addEventListener("talkie-jump-to-dedupe", (ev) => {
    const d = (ev as CustomEvent<{ dedupeKey: string }>).detail;
    const t = document.querySelector("talkie-transcript");
    if (t instanceof TalkieTranscript) {
      t.scrollToDedupeKey(d.dedupeKey);
    }
  });

  const refreshRelayStatus = async (): Promise<void> => {
    try {
      const res = await fetch(`${httpOrigin}/__agent-talkie/v1/relay/status`);
      if (res.status !== 200) {
        return;
      }
      const raw = (await res.json()) as {
        running?: unknown;
        activeConnectionCount?: unknown;
        stopSupported?: unknown;
        restartSupported?: unknown;
      };
      store.setRelayStatus({
        running: raw.running === true,
        activeConnectionCount:
          typeof raw.activeConnectionCount === "number"
            ? raw.activeConnectionCount
            : 0,
        stopSupported: raw.stopSupported === true,
        restartSupported: raw.restartSupported === true,
      });
    } catch {
      store.setRelayStatus({
        running: false,
        activeConnectionCount: 0,
        stopSupported: false,
        restartSupported: false,
      });
    }
  };

  const initialSpace = (() => {
    const params = new URLSearchParams(location.search);
    const slug = params.get("space");
    const label = params.get("label");
    return {
      slug: slug && slug.length > 0 ? slug : "default",
      label: label && label.trim().length > 0 ? label.trim() : undefined,
    };
  })();

  store.addListener(() => {
    const projection = store.getConsoleProjection();
    roster.entries = projection.participants;
    roster.selfIsOwner = store.selfIsOwner;
    roster.selfSessionId = store.selfSessionId ?? "";
    picker.currentSlug = store.currentSpaceSlug;
    picker.currentSpaceLabel = store.currentSpaceLabel;
    picker.selfIsOwner = store.selfIsOwner;
    picker.destroyedSlug = store.spaceDestroyedSlug;
    picker.archivedSlug = store.spaceArchivedSlug;
    shell.relayRunning = store.relayStatus.running;
    shell.activeConnectionCount = store.relayStatus.activeConnectionCount;
    shell.stopSupported = store.relayStatus.stopSupported;
    shell.restartSupported = store.relayStatus.restartSupported;
    searchPanel.style.display = store.transcriptSearchPanelOpen ? "flex" : "none";
    diagnosticsPanel.open = store.diagnosticsPanelOpen;
  });

  bridge.onProtocolError((w) => {
    if (bridge.hasRetryableConversation()) {
      store.pushProtocolError(w, {
        onRetry: () => {
          bridge.retryLastConversation();
        },
      });
    } else {
      store.pushProtocolError(w);
    }
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

  bridge.onOrchestratorRosterWire((msg) => {
    if (msg.type === "orchestrator.designated") {
      store.syncOrchestratorFromRelay(msg.spaceId, msg.orchestratorSessionId);
    } else if (msg.type === "orchestrator.cleared") {
      store.syncOrchestratorFromRelay(msg.spaceId, null);
    } else {
      store.syncOrchestratorFromRelay(msg.spaceId, msg.orchestratorSessionId);
    }
  });

  let pullSpaceSummary: () => Promise<void> = async () => {};

  bridge.onMembershipRemovedWire((msg) => {
    if (store.activeSpaceId !== null && msg.spaceId === store.activeSpaceId) {
      void pullSpaceSummary();
    }
  });

  bridge.onSpaceDestroyedWire((msg) => {
    store.noteSpaceDestroyed(msg.slug);
    if (msg.slug === store.currentSpaceSlug) {
      store.stopSnapshotRefresh();
      bridge.close();
    }
  });

  bridge.onSpaceArchivedWire((msg) => {
    store.noteSpaceArchived(msg.slug);
    if (msg.slug === store.currentSpaceSlug) {
      store.stopSnapshotRefresh();
      bridge.close();
    }
  });

  picker.addEventListener("talkie-space-refresh", () => {
    void pullSpaceSummary();
  });

  bridge.onConnectionHealthChange((s) => {
    shell.healthState = s;
    void refreshRelayStatus();
  });

  let relayStatusTimer: number | undefined;

  shell.addEventListener("talkie-relay-stop", () => {
    if (relayStatusTimer !== undefined) {
      window.clearInterval(relayStatusTimer);
      relayStatusTimer = undefined;
    }
    void fetch(`${httpOrigin}/__agent-talkie/v1/relay/stop`, {
      method: "POST",
    }).finally(() => {
      bridge.close();
      scheduleRelayStopStatusRefreshes(refreshRelayStatus);
    });
  });

  shell.addEventListener("talkie-relay-restart", () => {
    if (relayStatusTimer !== undefined) {
      window.clearInterval(relayStatusTimer);
      relayStatusTimer = undefined;
    }
    void fetch(`${httpOrigin}/__agent-talkie/v1/relay/restart`, {
      method: "POST",
    }).finally(() => {
      bridge.close();
      shell.showRefreshBanner = true;
      void refreshRelayStatus();
      window.setTimeout(() => {
        void refreshRelayStatus();
      }, 1500);
    });
  });

  bridge.onStaleUiChange(() => {
    shell.showRefreshBanner = bridge.getStaleUiReason() !== null;
  });

  const gen = readBootstrapRelayGeneration();
  if (gen !== null) {
    sessionStorage.setItem(RELAY_GENERATION_KEY, gen);
  }

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
    store.setCurrentSpaceSlug(initialSpace.slug);
    const joined = await connectJoinDashboardSession(
      bridge,
      initialSpace.slug,
      initialSpace.label,
    );
    const selfSessionId = joined.selfSessionId;
    store.setActiveSpaceId(joined.spaceId);
    store.setCurrentSpaceSlug(joined.slug);

    pullSpaceSummary = async (): Promise<void> => {
      const slug = store.currentSpaceSlug;
      const res = await fetch(
        `${httpOrigin}/__agent-talkie/v1/oversight/space-summary?slug=${encodeURIComponent(slug)}`,
      );
      if (res.status === 200) {
        const summary = (await res.json()) as OversightSpaceSummary;
        store.hydrateFromSpaceSummary(summary, selfSessionId);
      }
    };

    roster.selfSessionId = selfSessionId;

    await pullSpaceSummary();
    store.scheduleSnapshotRefresh(pullSpaceSummary, 10000);
    await refreshRelayStatus();
    relayStatusTimer = window.setInterval(() => {
      void refreshRelayStatus();
    }, 5000);

    persistRelayGenerationIfMissing(
      gen ?? sessionStorage.getItem(RELAY_GENERATION_KEY) ?? "",
    );
  } catch {
    shell.healthState = "disconnected";
    shell.refreshBannerText =
      "Could not open this Talkie space. Refresh to retry, or choose another active space.";
    shell.showRefreshBanner = true;
  }
})();
