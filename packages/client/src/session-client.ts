import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { z } from "zod";
import {
  relayHandshakeAckSchema,
  relayHandshakeNackSchema,
  safeParseEnvelope,
  type Envelope,
  type SessionRegisterMessage,
  sessionResumedMessageSchema,
  type SessionResumeMessage,
} from "@agent-talkie/protocol";

const DEFAULT_URL = "ws://127.0.0.1:18765";
const DEFAULT_SUPPORTED_VERSIONS = { minVersion: 1, maxVersion: 1 } as const;

const sessionRegisteredSchema = z.object({
  type: z.literal("session.registered"),
  sessionId: z.string().uuid(),
  reconnectSecret: z.string().min(1),
  displayName: z.string().min(1),
});

export type TalkieSessionClientOptions = {
  url?: string;
  supportedVersions?: { minVersion: number; maxVersion: number };
};

export class TalkieSessionClient {
  private readonly url: string;
  private readonly supportedVersions: { minVersion: number; maxVersion: number };
  private ws: WebSocket | null = null;
  private registeredSessionId: string | null = null;
  private readonly envelopeHandlers = new Set<(env: Envelope) => void>();
  private readonly relayMessageHandlers = new Set<(message: unknown) => void>();
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

  constructor(opts?: TalkieSessionClientOptions) {
    this.url = opts?.url ?? DEFAULT_URL;
    this.supportedVersions =
      opts?.supportedVersions ?? { ...DEFAULT_SUPPORTED_VERSIONS };
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      const fail = (err: Error) => {
        ws.removeAllListeners();
        if (this.ws === ws) {
          this.ws = null;
        }
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(err);
      };

      const onError = (e: Error) => {
        fail(e instanceof Error ? e : new Error(String(e)));
      };

      const onClose = () => {
        fail(new Error("WebSocket closed before handshake completed"));
      };

      const onHandshakeMessage = (data: WebSocket.RawData) => {
        ws.off("message", onHandshakeMessage);
        ws.off("close", onClose);

        let parsed: unknown;
        try {
          parsed = JSON.parse(String(data)) as unknown;
        } catch {
          fail(new Error("Invalid handshake response JSON"));
          return;
        }

        const nack = relayHandshakeNackSchema.safeParse(parsed);
        if (nack.success) {
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

        ws.off("error", onError);
        ws.on("error", () => {
          /* avoid unhandled "error" on long-lived socket */
        });
        ws.on("message", (d) => {
          this.dispatchPostHandshake(d);
        });
        resolve();
      };

      ws.once("error", onError);
      ws.once("close", onClose);
      ws.once("open", () => {
        ws.send(
          JSON.stringify({
            type: "handshake",
            supportedVersions: this.supportedVersions,
          }),
        );
        ws.on("message", onHandshakeMessage);
      });
    });
  }

  private dispatchPostHandshake(data: WebSocket.RawData): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data)) as unknown;
    } catch {
      return;
    }

    if (this.pendingRegister) {
      const reg = sessionRegisteredSchema.safeParse(parsed);
      if (reg.success) {
        const p = this.pendingRegister;
        this.pendingRegister = undefined;
        this.registeredSessionId = reg.data.sessionId;
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
          const spaceId = (parsed as { spaceId?: unknown }).spaceId;
          if (typeof spaceId === "string") {
            this.pendingJoin = undefined;
            pj.resolve({ spaceId, slug: pj.slug });
            return;
          }
        }
        if (t === "protocol.error") {
          this.pendingJoin = undefined;
          pj.reject(new Error(JSON.stringify(parsed)));
          return;
        }
      }
    }

    for (const h of this.relayMessageHandlers) {
      try {
        h(parsed);
      } catch {
        /* ignore handler errors */
      }
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

  async registerSession(
    input: SessionRegisterMessage["newSession"] & { isHuman?: boolean },
  ): Promise<{
    sessionId: string;
    reconnectSecret: string;
    displayName: string;
  }> {
    const ws = this.ws;
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
          newSession: input,
        }),
      );
    });
  }

  async resume(
    input: Pick<SessionResumeMessage, "sessionId" | "reconnectSecret">,
  ): Promise<{
    sessionId: string;
    reconnectSecret: string;
  }> {
    const ws = this.ws;
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
    label?: string;
    creatorOrchestrator?: boolean;
  }): Promise<{ spaceId: string; slug: string }> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    if (this.registeredSessionId === null) {
      throw new Error("joinSpace before registerSession");
    }
    if (this.pendingJoin) {
      throw new Error("space.join already in progress");
    }

    return new Promise((resolve, reject) => {
      this.pendingJoin = { resolve, reject, slug: args.slug };
      const payload: Record<string, unknown> = { slug: args.slug };
      if (args.label !== undefined) {
        payload.label = args.label;
      }
      if (args.creatorOrchestrator !== undefined) {
        payload.creatorOrchestrator = args.creatorOrchestrator;
      }
      ws.send(
        JSON.stringify({
          version: 1,
          id: randomUUID(),
          sessionId: this.registeredSessionId,
          kind: "control",
          type: "space.join",
          payload,
          idempotencyKey: args.idempotencyKey,
        }),
      );
    });
  }

  sendEnvelope(envelope: Envelope): void {
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(envelope));
    }
  }

  onEnvelope(handler: (env: Envelope) => void): void {
    this.envelopeHandlers.add(handler);
  }

  onRelayMessage(handler: (message: unknown) => void): void {
    this.relayMessageHandlers.add(handler);
  }

  close(): void {
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
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.removeAllListeners();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }
}
