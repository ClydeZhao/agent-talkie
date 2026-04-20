import {
  relayHandshakeAckSchema,
  relayHandshakeNackSchema,
  safeParseEnvelope,
  sessionResumedMessageSchema,
  type Envelope,
  type SessionResumeMessage,
} from "@agent-talkie/protocol";
import { deriveHttpOriginFromWsUrl } from "./derive-http-origin.js";
import { nextReconnectDelayMs } from "./reconnect-schedule.js";
import { probeRelayGenerationHealth } from "./relay-generation.js";
import {
  RECONNECT_SECRET_KEY,
  RELAY_GENERATION_KEY,
  SESSION_ID_KEY,
} from "./session-storage-keys.js";
import {
  collaborationMetadataWireSchema,
  collaborationOrchestratorWireSchema,
  orchestratorClearedWireSchema,
  orchestratorDesignatedWireSchema,
  protocolErrorWireSchema,
  sessionRegisteredWireSchema,
  spaceJoinedWireSchema,
  transcriptCatchupMessageSchema,
  type CollaborationMetadataWire,
  type OrchestratorRosterWire,
  type ProtocolErrorWire,
} from "./wire-schemas.js";

const DEFAULT_URL = "ws://127.0.0.1:18765";
const DEFAULT_SUPPORTED_VERSIONS = { minVersion: 1, maxVersion: 1 } as const;

export type ConnectionHealthUiState =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected";

export type StaleUiReason = "protocol_version" | "relay_generation";

export type TranscriptCatchupRow = {
  spaceId: string;
  relaySeq: number;
  envelope: unknown;
};

function storageSet(key: string, value: string): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(key, value);
  }
}

function storageGet(key: string): string | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  return sessionStorage.getItem(key);
}

function storageRemove(key: string): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(key);
  }
}

export type BrowserSessionBridgeOptions = {
  url?: string;
  supportedVersions?: { minVersion: number; maxVersion: number };
};

export class BrowserSessionBridge {
  private readonly url: string;
  private readonly supportedVersions: { minVersion: number; maxVersion: number };
  private socket: WebSocket | null = null;
  private negotiatedVersion: number | null = null;
  private registeredSessionId: string | null = null;
  private maxRelaySeq = 0;
  private _health: ConnectionHealthUiState = "disconnected";
  private readonly healthListeners = new Set<
    (s: ConnectionHealthUiState) => void
  >();
  private _staleReason: StaleUiReason | null = null;
  private readonly staleListeners = new Set<() => void>();
  private readonly envelopeHandlers = new Set<(env: Envelope) => void>();
  private readonly catchupListeners = new Set<(row: TranscriptCatchupRow) => void>();
  private readonly protocolErrorListeners = new Set<
    (p: ProtocolErrorWire) => void
  >();
  private readonly collaborationMetadataListeners = new Set<
    (m: CollaborationMetadataWire) => void
  >();
  private readonly orchestratorRosterListeners = new Set<
    (m: OrchestratorRosterWire) => void
  >();
  private pendingJoin:
    | {
        resolve: (v: { spaceId: string; slug: string }) => void;
        reject: (e: Error) => void;
        slug: string;
      }
    | undefined;
  private pendingRegister:
    | {
        resolve: (v: {
          sessionId: string;
          reconnectSecret: string;
          displayName: string;
        }) => void;
        reject: (e: Error) => void;
      }
    | undefined;
  private pendingResume:
    | {
        resolve: (v: {
          sessionId: string;
          reconnectSecret: string;
        }) => void;
        reject: (e: Error) => void;
      }
    | undefined;

  private _userRequestedClose = false;
  private _autoReconnectEnabled = false;
  private _joinSucceededAtLeastOnce = false;
  private _reconnectAttemptIndex = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRetryableEnvelope: Envelope | null = null;

  constructor(opts?: BrowserSessionBridgeOptions) {
    this.url = opts?.url ?? DEFAULT_URL;
    this.supportedVersions =
      opts?.supportedVersions ?? { ...DEFAULT_SUPPORTED_VERSIONS };
  }

  getNegotiatedEnvelopeVersion(): number | null {
    return this.negotiatedVersion;
  }

  getRegisteredSessionId(): string | null {
    return this.registeredSessionId;
  }

  sendEnvelope(envelope: Envelope): void {
    if (this.negotiatedVersion === null || this.registeredSessionId === null) {
      throw new Error("sendEnvelope: not_ready");
    }
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("sendEnvelope: socket_not_open");
    }
    const parsed = safeParseEnvelope(envelope);
    if (!parsed.success) {
      throw new Error("sendEnvelope: invalid envelope");
    }
    ws.send(JSON.stringify(envelope));
  }

  /** Tracks the envelope for error-bar Retry (D-10/D-11); same object reference on retry. */
  sendConversationWithRetryTracking(envelope: Envelope): void {
    if (envelope.kind !== "conversation") {
      throw new Error("sendConversationWithRetryTracking: not_conversation");
    }
    this.lastRetryableEnvelope = envelope;
    this.sendEnvelope(envelope);
  }

  retryLastConversation(): void {
    if (this.lastRetryableEnvelope === null) {
      throw new Error("retryLastConversation: no_retry");
    }
    this.sendEnvelope(this.lastRetryableEnvelope);
  }

  hasRetryableConversation(): boolean {
    return this.lastRetryableEnvelope !== null;
  }

  getMaxRelaySeq(): number {
    return this.maxRelaySeq;
  }

  onTranscriptCatchup(cb: (row: TranscriptCatchupRow) => void): () => void {
    this.catchupListeners.add(cb);
    return () => {
      this.catchupListeners.delete(cb);
    };
  }

  onEnvelope(handler: (env: Envelope) => void): () => void {
    this.envelopeHandlers.add(handler);
    return () => {
      this.envelopeHandlers.delete(handler);
    };
  }

  onProtocolError(cb: (p: ProtocolErrorWire) => void): () => void {
    this.protocolErrorListeners.add(cb);
    return () => {
      this.protocolErrorListeners.delete(cb);
    };
  }

  onCollaborationMetadata(
    cb: (m: CollaborationMetadataWire) => void,
  ): () => void {
    this.collaborationMetadataListeners.add(cb);
    return () => {
      this.collaborationMetadataListeners.delete(cb);
    };
  }

  onOrchestratorRosterWire(cb: (m: OrchestratorRosterWire) => void): () => void {
    this.orchestratorRosterListeners.add(cb);
    return () => {
      this.orchestratorRosterListeners.delete(cb);
    };
  }

  private emitOrchestratorRosterWire(msg: OrchestratorRosterWire): void {
    for (const cb of this.orchestratorRosterListeners) {
      try {
        cb(msg);
      } catch {
        /* ignore */
      }
    }
  }

  getConnectionHealth(): ConnectionHealthUiState {
    return this._health;
  }

  onConnectionHealthChange(
    cb: (s: ConnectionHealthUiState) => void,
  ): () => void {
    this.healthListeners.add(cb);
    return () => {
      this.healthListeners.delete(cb);
    };
  }

  getStaleUiReason(): StaleUiReason | null {
    return this._staleReason;
  }

  onStaleUiChange(cb: () => void): () => void {
    this.staleListeners.add(cb);
    return () => {
      this.staleListeners.delete(cb);
    };
  }

  notifyRelayGenerationStale(): void {
    this.setStaleReason("relay_generation");
  }

  clearStaleUi(): void {
    this._staleReason = null;
    this.emitStale();
  }

  private setHealth(next: ConnectionHealthUiState): void {
    if (this._health === next) {
      return;
    }
    this._health = next;
    for (const cb of this.healthListeners) {
      try {
        cb(next);
      } catch {
        /* ignore */
      }
    }
  }

  private setStaleReason(reason: StaleUiReason): void {
    this._staleReason = reason;
    this.emitStale();
  }

  private emitStale(): void {
    for (const cb of this.staleListeners) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  }

  private clearReconnectTimer(): void {
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  private rejectAllPending(reason: string): void {
    const pend = this.pendingRegister;
    this.pendingRegister = undefined;
    if (pend) {
      pend.reject(new Error(reason));
    }
    const pr = this.pendingResume;
    this.pendingResume = undefined;
    if (pr) {
      pr.reject(new Error(reason));
    }
    const pj = this.pendingJoin;
    this.pendingJoin = undefined;
    if (pj) {
      pj.reject(new Error(reason));
    }
  }

  private handleTransportDrop(ws: WebSocket): void {
    if (this.socket !== ws) {
      return;
    }
    this.socket = null;
    this.negotiatedVersion = null;
    this.registeredSessionId = null;

    try {
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
    } catch {
      /* ignore */
    }

    this.rejectAllPending("WebSocket closed");

    if (this._userRequestedClose) {
      this.setHealth("disconnected");
      return;
    }
    if (!this._joinSucceededAtLeastOnce || !this._autoReconnectEnabled) {
      this.setHealth("disconnected");
      return;
    }
    void this.beginReconnectBackoff();
  }

  private async beginReconnectBackoff(): Promise<void> {
    if (this._userRequestedClose) {
      return;
    }
    if (!this._autoReconnectEnabled || !this._joinSucceededAtLeastOnce) {
      return;
    }

    this.setHealth("reconnecting");

    const gen = storageGet(RELAY_GENERATION_KEY);
    if (gen !== null && gen !== "") {
      const ok = await probeRelayGenerationHealth(
        deriveHttpOriginFromWsUrl(this.url),
        gen,
      );
      if (this._userRequestedClose) {
        return;
      }
      if (!ok) {
        this.notifyRelayGenerationStale();
        this.setHealth("disconnected");
        return;
      }
    }

    this.clearReconnectTimer();
    const delay = nextReconnectDelayMs(this._reconnectAttemptIndex++);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      void this.internalReconnect();
    }, delay);
  }

  private async internalReconnect(): Promise<void> {
    if (this._userRequestedClose) {
      return;
    }
    if (!this._autoReconnectEnabled || !this._joinSucceededAtLeastOnce) {
      return;
    }

    try {
      await this.establishConnectionAndHandshake();

      const sessionId = storageGet(SESSION_ID_KEY);
      const reconnectSecret = storageGet(RECONNECT_SECRET_KEY);
      if (sessionId && reconnectSecret) {
        try {
          await this.resume({ sessionId, reconnectSecret });
        } catch {
          storageRemove(SESSION_ID_KEY);
          storageRemove(RECONNECT_SECRET_KEY);
          await this.registerNewSession({
            displayName: "Human",
            runtime: "browser",
            workspaceLabel: "dashboard",
          });
        }
      } else {
        await this.registerNewSession({
          displayName: "Human",
          runtime: "browser",
          workspaceLabel: "dashboard",
        });
      }
      await this.joinSpace({
        slug: "dashboard",
        idempotencyKey: crypto.randomUUID(),
      });
      this._reconnectAttemptIndex = 0;
    } catch {
      if (this._userRequestedClose) {
        return;
      }
      void this.beginReconnectBackoff();
    }
  }

  private establishConnectionAndHandshake(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.socket = ws;

      const fail = (err: Error) => {
        ws.onmessage = null;
        ws.onopen = null;
        ws.onerror = null;
        ws.onclose = null;
        if (this.socket === ws) {
          this.socket = null;
        }
        this.negotiatedVersion = null;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(err);
      };

      const onError = () => {
        fail(new Error("WebSocket error before handshake completed"));
      };

      const onClose = () => {
        fail(new Error("WebSocket closed before handshake completed"));
      };

      const onHandshakeMessage = (ev: MessageEvent) => {
        ws.onmessage = null;
        ws.onclose = null;

        let parsed: unknown;
        try {
          parsed = JSON.parse(String((ev as MessageEvent).data)) as unknown;
        } catch {
          fail(new Error("Invalid handshake response JSON"));
          return;
        }

        const nack = relayHandshakeNackSchema.safeParse(parsed);
        if (nack.success) {
          this.setStaleReason("protocol_version");
          fail(new Error(`Handshake nack: ${nack.data.message}`));
          return;
        }

        const ack = relayHandshakeAckSchema.safeParse(parsed);
        if (!ack.success) {
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "type" in parsed &&
            (parsed as { type: string }).type === "protocol.error"
          ) {
            fail(new Error("protocol.error during handshake"));
          } else {
            fail(new Error("Invalid handshake response"));
          }
          return;
        }

        this.negotiatedVersion = ack.data.negotiatedVersion;

        ws.onmessage = (e) => {
          this.dispatchPostHandshake(e);
        };
        ws.onerror = () => {
          this.handleTransportDrop(ws);
        };
        ws.onclose = () => {
          this.handleTransportDrop(ws);
        };
        resolve();
      };

      ws.onerror = onError;
      ws.onclose = onClose;
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "handshake",
            supportedVersions: this.supportedVersions,
          }),
        );
        ws.onmessage = onHandshakeMessage;
      };
    });
  }

  async connect(opts?: { autoReconnect?: boolean }): Promise<void> {
    this._userRequestedClose = false;
    this._autoReconnectEnabled = opts?.autoReconnect === true;

    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.setHealth("connecting");

    try {
      await this.establishConnectionAndHandshake();
    } catch (err) {
      this.setHealth("disconnected");
      throw err;
    }
  }

  private dispatchPostHandshake(ev: MessageEvent): void {
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(String(ev.data)) as unknown;
    } catch {
      return;
    }

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      (parsed as { type: string }).type === "protocol.error" &&
      "error" in parsed &&
      (parsed as { error: string }).error === "envelope_version_mismatch"
    ) {
      this.setStaleReason("protocol_version");
    }

    if (this.pendingRegister) {
      const reg = sessionRegisteredWireSchema.safeParse(parsed);
      if (reg.success) {
        const p = this.pendingRegister;
        this.pendingRegister = undefined;
        this.registeredSessionId = reg.data.sessionId;
        storageSet(SESSION_ID_KEY, reg.data.sessionId);
        storageSet(RECONNECT_SECRET_KEY, reg.data.reconnectSecret);
        p.resolve({
          sessionId: reg.data.sessionId,
          reconnectSecret: reg.data.reconnectSecret,
          displayName: reg.data.displayName,
        });
        return;
      }
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "type" in parsed &&
        (parsed as { type: string }).type === "protocol.error"
      ) {
        const p = this.pendingRegister;
        this.pendingRegister = undefined;
        this.setHealth("disconnected");
        p.reject(new Error("protocol.error during session.register"));
        return;
      }
      return;
    }

    if (this.pendingResume) {
      const resumed = sessionResumedMessageSchema.safeParse(parsed);
      if (resumed.success) {
        const p = this.pendingResume;
        this.pendingResume = undefined;
        this.registeredSessionId = resumed.data.sessionId;
        storageSet(RECONNECT_SECRET_KEY, resumed.data.reconnectSecret);
        p.resolve({
          sessionId: resumed.data.sessionId,
          reconnectSecret: resumed.data.reconnectSecret,
        });
        return;
      }
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "type" in parsed &&
        (parsed as { type: string }).type === "protocol.error"
      ) {
        const p = this.pendingResume;
        this.pendingResume = undefined;
        this.setHealth("disconnected");
        p.reject(new Error("protocol.error during session.resume"));
        return;
      }
      return;
    }

    if (this.pendingJoin) {
      const pj = this.pendingJoin;
      if (typeof parsed === "object" && parsed !== null && "type" in parsed) {
        const t = (parsed as { type: string }).type;
        if (t === "space.joined") {
          const parsedJoin = spaceJoinedWireSchema.safeParse(parsed);
          if (parsedJoin.success) {
            this.pendingJoin = undefined;
            this._joinSucceededAtLeastOnce = true;
            this.setHealth("connected");
            pj.resolve({
              spaceId: parsedJoin.data.spaceId,
              slug: pj.slug,
            });
            return;
          }
        }
        if (t === "protocol.error") {
          this.pendingJoin = undefined;
          this.setHealth("disconnected");
          pj.reject(new Error(JSON.stringify(parsed)));
          return;
        }
      }
      return;
    }

    const protocolErr = protocolErrorWireSchema.safeParse(parsed);
    if (protocolErr.success) {
      if (protocolErr.data.error === "envelope_version_mismatch") {
        this.setStaleReason("protocol_version");
      }
      for (const cb of this.protocolErrorListeners) {
        try {
          cb(protocolErr.data);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const catchup = transcriptCatchupMessageSchema.safeParse(parsed);
    if (catchup.success) {
      const prev = this.maxRelaySeq;
      const seq = catchup.data.relaySeq;
      if (seq > prev) {
        this.maxRelaySeq = seq;
        const row: TranscriptCatchupRow = {
          spaceId: catchup.data.spaceId,
          relaySeq: seq,
          envelope: catchup.data.envelope,
        };
        for (const cb of this.catchupListeners) {
          try {
            cb(row);
          } catch {
            /* ignore */
          }
        }
      }
      return;
    }

    const collabMeta = collaborationMetadataWireSchema.safeParse(parsed);
    if (collabMeta.success) {
      for (const cb of this.collaborationMetadataListeners) {
        try {
          cb(collabMeta.data);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const orchDesignated = orchestratorDesignatedWireSchema.safeParse(parsed);
    if (orchDesignated.success) {
      this.emitOrchestratorRosterWire(orchDesignated.data);
      return;
    }
    const orchCleared = orchestratorClearedWireSchema.safeParse(parsed);
    if (orchCleared.success) {
      this.emitOrchestratorRosterWire(orchCleared.data);
      return;
    }
    const orchCollab = collaborationOrchestratorWireSchema.safeParse(parsed);
    if (orchCollab.success) {
      this.emitOrchestratorRosterWire(orchCollab.data);
      return;
    }

    const env = safeParseEnvelope(parsed);
    if (env.success) {
      for (const h of this.envelopeHandlers) {
        try {
          h(env.data);
        } catch {
          /* ignore handler errors */
        }
      }
    }
  }

  async registerNewSession(input: {
    displayName: string;
    runtime: string;
    workspaceLabel: string;
    branch?: string;
    focus?: string;
  }): Promise<{
    sessionId: string;
    reconnectSecret: string;
    displayName: string;
  }> {
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    if (this.pendingRegister) {
      throw new Error("session.register already in progress");
    }

    return new Promise((resolve, reject) => {
      this.pendingRegister = { resolve, reject };
      ws.send(
        JSON.stringify({
          type: "session.register",
          newSession: {
            displayName: input.displayName,
            runtime: input.runtime,
            workspaceLabel: input.workspaceLabel,
            ...(input.branch !== undefined ? { branch: input.branch } : {}),
            ...(input.focus !== undefined ? { focus: input.focus } : {}),
            isHuman: true,
          },
        }),
      );
    });
  }

  /**
   * Resume using credentials from `sessionStorage`.
   * Listener is already attached after `connect()` (before any outbound resume).
   */
  async resumeFromStorage(): Promise<{
    sessionId: string;
    reconnectSecret: string;
  } | null> {
    const sessionId = storageGet(SESSION_ID_KEY);
    const reconnectSecret = storageGet(RECONNECT_SECRET_KEY);
    if (!sessionId || !reconnectSecret) {
      return null;
    }
    try {
      return await this.resume({
        sessionId,
        reconnectSecret,
      });
    } catch {
      return null;
    }
  }

  private async resume(
    input: SessionResumeMessage,
  ): Promise<{ sessionId: string; reconnectSecret: string }> {
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    if (this.pendingResume) {
      throw new Error("session.resume already in progress");
    }

    return new Promise((resolve, reject) => {
      this.pendingResume = { resolve, reject };
      ws.send(
        JSON.stringify({
          type: "session.resume",
          sessionId: input.sessionId,
          reconnectSecret: input.reconnectSecret,
        }),
      );
    });
  }

  async joinSpace(args: {
    slug: string;
    idempotencyKey: string;
  }): Promise<{ spaceId: string; slug: string }> {
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    if (this.registeredSessionId === null) {
      throw new Error("joinSpace before register or resume");
    }
    if (this.negotiatedVersion === null) {
      throw new Error("joinSpace before handshake negotiated version");
    }
    if (this.pendingJoin) {
      throw new Error("space.join already in progress");
    }

    return new Promise((resolve, reject) => {
      this.pendingJoin = { resolve, reject, slug: args.slug };
      ws.send(
        JSON.stringify({
          version: this.negotiatedVersion,
          id: crypto.randomUUID(),
          sessionId: this.registeredSessionId,
          kind: "control",
          type: "space.join",
          payload: { slug: args.slug },
          idempotencyKey: args.idempotencyKey,
        }),
      );
    });
  }

  close(): void {
    this._userRequestedClose = true;
    this.clearReconnectTimer();
    this._joinSucceededAtLeastOnce = false;
    this._reconnectAttemptIndex = 0;
    this.setHealth("disconnected");

    const pend = this.pendingRegister;
    this.pendingRegister = undefined;
    if (pend) {
      pend.reject(new Error("client closed"));
    }
    const pr = this.pendingResume;
    this.pendingResume = undefined;
    if (pr) {
      pr.reject(new Error("client closed"));
    }
    const pj = this.pendingJoin;
    this.pendingJoin = undefined;
    if (pj) {
      pj.reject(new Error("client closed"));
    }
    this.registeredSessionId = null;
    this.negotiatedVersion = null;
    const ws = this.socket;
    this.socket = null;
    if (ws) {
      ws.onmessage = null;
      ws.onopen = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }
}
