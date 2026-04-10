import http from "node:http";
import { randomBytes } from "node:crypto";
import {
  agreeProtocolVersion,
  buildVersionMismatchFailure,
  relayClientHandshakeSchema,
  sessionRegisterMessageSchema,
  sessionResumeMessageSchema,
  versionRangesOverlap,
  type Envelope,
  type SupportedVersions,
} from "@agent-talkie/protocol";
import {
  createSession,
  findActiveMembershipForSession,
  migrate,
  openDatabase,
} from "@agent-talkie/persistence";
import type Database from "better-sqlite3";
import type { RawData } from "ws";
import { WebSocketServer, type WebSocket } from "ws";
import { sendTranscriptCatchUp } from "./catch-up.js";
import { hashReconnectSecret, verifyReconnectSecret } from "./reconnect-secret.js";
import { SessionRegistry } from "./session-registry.js";
import {
  handleSpaceJoin,
  handleSpaceLeave,
  isSpaceJoinEnvelope,
  isSpaceLeaveEnvelope,
} from "./space-lifecycle.js";
import { parseAndValidateEnvelope } from "./validation.js";

/** Post-bind frames: JSON → {@link parseAndValidateEnvelope} (wraps `safeParseEnvelope`). */
export const DEFAULT_RELAY_PORT = 18765;
export const LISTEN_HOST = "127.0.0.1";
export const MAX_INBOUND_WS_BYTES = 262144;
export const RELAY_SUPPORTED_VERSIONS: SupportedVersions = {
  minVersion: 1,
  maxVersion: 1,
};
export const SESSION_RESUME_TTL_MS = 604800000;

export type RelayWsContext = {
  ws: WebSocket;
  boundSessionId: string;
  negotiatedVersion: number;
};

export type RelayDispatchContext = RelayWsContext & {
  db: Database.Database;
  registry: SessionRegistry;
};

export function dispatchValidatedEnvelope(
  ctx: RelayDispatchContext,
  envelope: Envelope,
): void {
  if (isSpaceJoinEnvelope(envelope)) {
    const idempotencyKey = envelope.idempotencyKey;
    if (!idempotencyKey) {
      sendJson(ctx.ws, { type: "protocol.error", error: "invalid_envelope" });
      return;
    }
    const slug = envelope.payload.slug;
    if (typeof slug !== "string") {
      sendJson(ctx.ws, { type: "protocol.error", error: "invalid_envelope" });
      return;
    }
    const out = handleSpaceJoin(ctx.db, {
      sessionId: ctx.boundSessionId,
      idempotencyKey,
      slugRaw: slug,
      nowMs: Date.now(),
    });
    if (out.kind === "error") {
      sendJson(ctx.ws, { type: "protocol.error", error: out.error });
      if (out.closeConnection) {
        ctx.ws.close();
      }
      return;
    }
    sendJson(ctx.ws, {
      type: "space.joined",
      spaceId: out.spaceId,
      slug: out.slug,
    });
    void sendTranscriptCatchUp({
      db: ctx.db,
      ws: ctx.ws,
      spaceId: out.spaceId,
    });
    return;
  }

  if (isSpaceLeaveEnvelope(envelope)) {
    const idempotencyKey = envelope.idempotencyKey;
    if (!idempotencyKey) {
      sendJson(ctx.ws, { type: "protocol.error", error: "invalid_envelope" });
      return;
    }
    const out = handleSpaceLeave(ctx.db, {
      sessionId: ctx.boundSessionId,
      idempotencyKey,
      nowMs: Date.now(),
    });
    if (out.kind === "error") {
      sendJson(ctx.ws, { type: "protocol.error", error: out.error });
      if (out.closeConnection) {
        ctx.ws.close();
      }
      return;
    }
    sendJson(ctx.ws, {
      type: "space.left",
      spaceId: out.spaceId,
    });
    return;
  }

  // Routed envelopes: plan 02-03 Task 2 (router).
}

type ConnState = {
  negotiatedVersion: number | null;
  boundSessionId: string | null;
};

function rawDataByteLength(data: RawData): number {
  if (typeof data === "string") {
    return Buffer.byteLength(data, "utf8");
  }
  if (Buffer.isBuffer(data)) {
    return data.length;
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }
  if (Array.isArray(data)) {
    let n = 0;
    for (const buf of data) {
      n += buf.length;
    }
    return n;
  }
  return 0;
}

function rawDataToString(data: RawData): string {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return "";
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export async function createRelayServer(opts: {
  dbPath: string;
  port?: number;
  pepper?: string;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const db = openDatabase(opts.dbPath);
  migrate(db);
  const pepper =
    opts.pepper ??
    process.env.AGENT_TALKIE_RECONNECT_PEPPER ??
    "dev-reconnect-pepper";

  const registry = new SessionRegistry();
  const connStates = new Map<WebSocket, ConnState>();

  const server = http.createServer();
  const wss = new WebSocketServer({ server });

  const handleMessage = (ws: WebSocket, data: RawData, isBinary: boolean) => {
    const state = connStates.get(ws);
    if (!state) {
      return;
    }

    if (isBinary) {
      sendJson(ws, { type: "protocol.error", error: "invalid_handshake" });
      ws.close();
      return;
    }

    if (rawDataByteLength(data) > MAX_INBOUND_WS_BYTES) {
      ws.close();
      return;
    }

    const text = rawDataToString(data);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      if (state.negotiatedVersion === null) {
        sendJson(ws, { type: "protocol.error", error: "invalid_handshake" });
      } else {
        sendJson(ws, { type: "protocol.error", error: "invalid_json" });
      }
      ws.close();
      return;
    }

    if (state.negotiatedVersion === null) {
      const hs = relayClientHandshakeSchema.safeParse(parsed);
      if (!hs.success) {
        sendJson(ws, { type: "protocol.error", error: "invalid_handshake" });
        ws.close();
        return;
      }
      const client = hs.data.supportedVersions;
      if (!versionRangesOverlap(client, RELAY_SUPPORTED_VERSIONS)) {
        const failure = buildVersionMismatchFailure(RELAY_SUPPORTED_VERSIONS);
        sendJson(ws, { type: "handshake.nack", ...failure });
        ws.close();
        return;
      }
      const negotiatedVersion = agreeProtocolVersion(
        client,
        RELAY_SUPPORTED_VERSIONS,
      );
      state.negotiatedVersion = negotiatedVersion;
      sendJson(ws, {
        type: "handshake.ack",
        negotiatedVersion,
        relay: RELAY_SUPPORTED_VERSIONS,
      });
      return;
    }

    if (state.boundSessionId === null) {
      if (typeof parsed !== "object" || parsed === null) {
        sendJson(ws, { type: "protocol.error", error: "invalid_json" });
        ws.close();
        return;
      }
      const o = parsed as { type?: string };
      if (o.type === "session.register") {
        const reg = sessionRegisterMessageSchema.safeParse(parsed);
        if (!reg.success) {
          sendJson(ws, {
            type: "protocol.error",
            error: "invalid_session_message",
          });
          return;
        }
        const { id, displayName } = createSession(db, reg.data.newSession);
        const secret = randomBytes(32).toString("base64url");
        const hash = hashReconnectSecret(secret, pepper);
        const validUntil = Date.now() + SESSION_RESUME_TTL_MS;
        db.prepare(
          "UPDATE sessions SET reconnect_secret_hash=?, reconnect_valid_until=? WHERE id=?",
        ).run(hash, validUntil, id);
        registry.bind(id, ws);
        state.boundSessionId = id;
        sendJson(ws, {
          type: "session.registered",
          sessionId: id,
          reconnectSecret: secret,
          displayName,
        });
        return;
      }
      if (o.type === "session.resume") {
        const res = sessionResumeMessageSchema.safeParse(parsed);
        if (!res.success) {
          sendJson(ws, {
            type: "protocol.error",
            error: "invalid_session_message",
          });
          return;
        }
        const row = db
          .prepare(
            "SELECT reconnect_secret_hash, reconnect_valid_until FROM sessions WHERE id = ?",
          )
          .get(res.data.sessionId) as
          | {
              reconnect_secret_hash: string | null;
              reconnect_valid_until: number | null;
            }
          | undefined;
        if (
          !row?.reconnect_secret_hash ||
          row.reconnect_valid_until == null ||
          Date.now() > row.reconnect_valid_until
        ) {
          sendJson(ws, { type: "protocol.error", error: "resume_rejected" });
          ws.close();
          return;
        }
        if (
          !verifyReconnectSecret(
            res.data.reconnectSecret,
            pepper,
            row.reconnect_secret_hash,
          )
        ) {
          sendJson(ws, { type: "protocol.error", error: "resume_rejected" });
          ws.close();
          return;
        }
        const newSecret = randomBytes(32).toString("base64url");
        const newHash = hashReconnectSecret(newSecret, pepper);
        const newValid = Date.now() + SESSION_RESUME_TTL_MS;
        db.prepare(
          "UPDATE sessions SET reconnect_secret_hash=?, reconnect_valid_until=? WHERE id=?",
        ).run(newHash, newValid, res.data.sessionId);
        registry.bind(res.data.sessionId, ws);
        state.boundSessionId = res.data.sessionId;
        sendJson(ws, {
          type: "session.resumed",
          sessionId: res.data.sessionId,
        });
        const mem = findActiveMembershipForSession(db, res.data.sessionId);
        if (mem) {
          void sendTranscriptCatchUp({
            db,
            ws,
            spaceId: mem.spaceId,
          });
        }
        return;
      }
      sendJson(ws, {
        type: "protocol.error",
        error: "expected_session_register_or_resume",
      });
      return;
    }

    if (typeof parsed !== "object" || parsed === null) {
      sendJson(ws, { type: "protocol.error", error: "invalid_json" });
      return;
    }
    const validated = parseAndValidateEnvelope(parsed);
    if (!validated.ok) {
      sendJson(ws, {
        type: "protocol.error",
        error: "invalid_envelope",
        issues: validated.issues,
      });
      return;
    }
    const envelope = validated.envelope;
    if (envelope.version !== state.negotiatedVersion) {
      sendJson(ws, {
        type: "protocol.error",
        error: "envelope_version_mismatch",
      });
      ws.close();
      return;
    }
    if (envelope.sessionId !== state.boundSessionId) {
      sendJson(ws, { type: "protocol.error", error: "session_mismatch" });
      return;
    }
    dispatchValidatedEnvelope(
      {
        ws,
        boundSessionId: state.boundSessionId,
        negotiatedVersion: state.negotiatedVersion,
        db,
        registry,
      },
      envelope,
    );
  };

  wss.on("connection", (ws: WebSocket) => {
    connStates.set(ws, {
      negotiatedVersion: null,
      boundSessionId: null,
    });
    ws.on("message", (data, isBinary) => {
      handleMessage(ws, data, Boolean(isBinary));
    });
    ws.on("close", () => {
      registry.remove(ws);
      connStates.delete(ws);
    });
    ws.on("error", () => {
      registry.remove(ws);
      connStates.delete(ws);
    });
  });

  const listenPort = opts.port ?? DEFAULT_RELAY_PORT;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, LISTEN_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const addr = server.address();
  const actualPort =
    typeof addr === "object" && addr !== null ? addr.port : listenPort;

  return {
    url: `ws://${LISTEN_HOST}:${actualPort}`,
    close: () =>
      new Promise((resolve, reject) => {
        for (const client of wss.clients) {
          client.terminate();
        }
        wss.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          try {
            db.close();
          } catch {
            /* ignore */
          }
          server.close((e) => {
            if (e) {
              reject(e);
            } else {
              resolve();
            }
          });
        });
      }),
  };
}
