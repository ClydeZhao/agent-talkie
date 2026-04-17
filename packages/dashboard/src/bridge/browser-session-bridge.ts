import {
  relayHandshakeAckSchema,
  relayHandshakeNackSchema,
  safeParseEnvelope,
  sessionResumedMessageSchema,
  type Envelope,
  type SessionResumeMessage,
} from "@agent-talkie/protocol";
import {
  RECONNECT_SECRET_KEY,
  SESSION_ID_KEY,
} from "./session-storage-keys.js";
import {
  sessionRegisteredWireSchema,
  spaceJoinedWireSchema,
  transcriptCatchupMessageSchema,
} from "./wire-schemas.js";

const DEFAULT_URL = "ws://127.0.0.1:18765";
const DEFAULT_SUPPORTED_VERSIONS = { minVersion: 1, maxVersion: 1 } as const;

export type ConnectionHealthUiState =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected";

export type StaleUiReason = "protocol_version" | "relay_generation";

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

  constructor(opts?: BrowserSessionBridgeOptions) {
    this.url = opts?.url ?? DEFAULT_URL;
    this.supportedVersions =
      opts?.supportedVersions ?? { ...DEFAULT_SUPPORTED_VERSIONS };
  }

  getNegotiatedEnvelopeVersion(): number | null {
    return this.negotiatedVersion;
  }

  getMaxRelaySeq(): number {
    return this.maxRelaySeq;
  }

  onEnvelope(handler: (env: Envelope) => void): () => void {
    this.envelopeHandlers.add(handler);
    return () => {
      this.envelopeHandlers.delete(handler);
    };
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

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.setHealth("connecting");

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
        this.setHealth("disconnected");
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

        ws.onerror = () => {
          /* avoid unhandled errors on long-lived socket */
        };
        ws.onmessage = (e) => {
          this.dispatchPostHandshake(e);
        };
        ws.onclose = () => {
          this.setHealth("disconnected");
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

    const catchup = transcriptCatchupMessageSchema.safeParse(parsed);
    if (catchup.success) {
      if (catchup.data.relaySeq > this.maxRelaySeq) {
        this.maxRelaySeq = catchup.data.relaySeq;
      }
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
