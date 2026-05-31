import http from "node:http";
import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
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
  getOversightSpaceSummaryBySlug,
  listOversightSpaces,
  migrate,
  normalizeSpaceSlug,
  openDatabase,
  upsertCollaborationStatus,
} from "@agent-talkie/persistence";
import type Database from "better-sqlite3";
import sirv from "sirv";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { sendTranscriptCatchUp } from "./catch-up.js";
import { hashReconnectSecret, verifyReconnectSecret } from "./reconnect-secret.js";
import { handleCollaborationControl } from "./collaboration-handlers.js";
import { routeEnvelope } from "./router.js";
import { SessionRegistry } from "./session-registry.js";
import {
  handleMembershipRemove,
  handleSpaceArchive,
  handleSpaceDestroy,
  handleSpaceJoin,
  handleSpaceLeave,
  isSpaceArchiveEnvelope,
  isMembershipRemoveEnvelope,
  isSpaceDestroyEnvelope,
  isSpaceJoinEnvelope,
  isSpaceLeaveEnvelope,
  pruneStaleDisconnectedMemberships,
  pruneExpiredArchivedSpaces,
} from "./space-lifecycle.js";
import { parseAndValidateEnvelope } from "./validation.js";

const require = createRequire(import.meta.url);

function resolveDashboardAppDir(): string {
  const pkg = require.resolve("@agent-talkie/dashboard/package.json");
  return join(dirname(pkg), "dist-app");
}

let dashboardSirv: ReturnType<typeof sirv> | undefined;

function getDashboardSirv(): ReturnType<typeof sirv> {
  if (!dashboardSirv) {
    dashboardSirv = sirv(resolveDashboardAppDir(), { single: true, dev: false });
  }
  return dashboardSirv;
}

/** Post-bind frames: JSON → {@link parseAndValidateEnvelope} (wraps `safeParseEnvelope`). */
export const DEFAULT_RELAY_IDLE_SHUTDOWN_MS = 300000;
export const DEFAULT_RELAY_PORT = 18765;
export const LISTEN_HOST = "127.0.0.1";
export const MAX_INBOUND_WS_BYTES = 262144;
export const RELAY_SUPPORTED_VERSIONS: SupportedVersions = {
  minVersion: 1,
  maxVersion: 1,
};
export const SESSION_RESUME_TTL_MS = 604800000;
export const DESTROY_TOMBSTONE_TTL_MS = 60_000;

export type RelayWsContext = {
  ws: WebSocket;
  boundSessionId: string;
  negotiatedVersion: number;
};

export type RelayDispatchContext = RelayWsContext & {
  db: Database.Database;
  registry: SessionRegistry;
  destroyedSlugs: Map<string, number>;
};

type SpaceActionability = {
  state: "ready" | "manual-pull" | "blocked";
  reason:
    | "ready"
    | "orchestrator_manual_pull"
    | "empty_space"
    | "no_orchestrator"
    | "orchestrator_missing"
    | "orchestrator_offline"
    | "orchestrator_stale";
  label: string;
  detail: string;
};

function isPullMode(inboxMode: string | undefined): boolean {
  return inboxMode === "pull";
}

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
    const creatorOrchestrator =
      envelope.payload.creatorOrchestrator === true ? true : false;
    const label =
      typeof envelope.payload.label === "string" &&
      envelope.payload.label.trim().length > 0
        ? envelope.payload.label.trim()
        : undefined;
    if (label !== undefined && label.length > 128) {
      sendJson(ctx.ws, { type: "protocol.error", error: "invalid_envelope" });
      return;
    }

    try {
      const slugNorm = normalizeSpaceSlug(slug);
      const destroyedAt = ctx.destroyedSlugs.get(slugNorm);
      if (destroyedAt !== undefined && Date.now() - destroyedAt < DESTROY_TOMBSTONE_TTL_MS) {
        sendJson(ctx.ws, { type: "protocol.error", error: "space_recently_destroyed" });
        return;
      }
      if (destroyedAt !== undefined) {
        ctx.destroyedSlugs.delete(slugNorm);
      }
    } catch {
      /* normalizeSpaceSlug may throw for invalid slugs; handleSpaceJoin will reject below */
    }

    const joinArgs: Parameters<typeof handleSpaceJoin>[1] = {
      sessionId: ctx.boundSessionId,
      idempotencyKey,
      slugRaw: slug,
      nowMs: Date.now(),
      creatorOrchestrator,
    };
    if (label !== undefined) {
      joinArgs.label = label;
    }
    const out = handleSpaceJoin(ctx.db, joinArgs);
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
    const activityNow = Date.now();
    upsertCollaborationStatus(ctx.db, {
      spaceId: out.spaceId,
      sessionId: ctx.boundSessionId,
      patch: { lastActivityMs: activityNow },
      nowMs: activityNow,
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

  if (isSpaceArchiveEnvelope(envelope)) {
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
    const out = handleSpaceArchive(ctx.db, {
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
    for (const sid of out.closeSessionIds) {
      if (sid === ctx.boundSessionId) {
        continue;
      }
      const s = ctx.registry.get(sid);
      if (s) {
        sendJson(s, { type: "space.archived", slug: out.slug });
      }
    }
    sendJson(ctx.ws, { type: "space.archived", slug: out.slug });
    for (const sid of out.closeSessionIds) {
      const s = ctx.registry.get(sid);
      if (s) {
        s.close();
      }
    }
    ctx.ws.close();
    return;
  }

  if (isSpaceDestroyEnvelope(envelope)) {
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
    const out = handleSpaceDestroy(ctx.db, {
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
    ctx.destroyedSlugs.set(out.slug, Date.now());

    for (const sid of out.closeSessionIds) {
      if (sid === ctx.boundSessionId) {
        continue;
      }
      const s = ctx.registry.get(sid);
      if (s) {
        sendJson(s, { type: "space.destroyed", slug: out.slug });
      }
    }
    sendJson(ctx.ws, { type: "space.destroyed", slug: out.slug });

    for (const sid of out.closeSessionIds) {
      const s = ctx.registry.get(sid);
      if (s) {
        s.close();
      }
    }
    ctx.ws.close();
    return;
  }

  if (isMembershipRemoveEnvelope(envelope)) {
    const idempotencyKey = envelope.idempotencyKey;
    if (!idempotencyKey) {
      sendJson(ctx.ws, { type: "protocol.error", error: "invalid_envelope" });
      return;
    }
    const spaceId = envelope.spaceId;
    if (typeof spaceId !== "string") {
      sendJson(ctx.ws, { type: "protocol.error", error: "invalid_envelope" });
      return;
    }
    const targetSessionId = envelope.payload.targetSessionId;
    if (typeof targetSessionId !== "string") {
      sendJson(ctx.ws, { type: "protocol.error", error: "invalid_envelope" });
      return;
    }
    const out = handleMembershipRemove(ctx.db, {
      sessionId: ctx.boundSessionId,
      spaceId,
      targetSessionId,
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
      type: "membership.removed",
      spaceId: out.spaceId,
      targetSessionId: out.targetSessionId,
    });
    ctx.registry.get(out.targetSessionId)?.close();
    return;
  }

  if (handleCollaborationControl(ctx, envelope)) {
    return;
  }

  if (envelope.spaceId !== undefined) {
    const activityNow = Date.now();
    upsertCollaborationStatus(ctx.db, {
      spaceId: envelope.spaceId,
      sessionId: ctx.boundSessionId,
      patch: { lastActivityMs: activityNow },
      nowMs: activityNow,
    });
  }

  routeEnvelope({
    db: ctx.db,
    envelope,
    senderWs: ctx.ws,
    getSocketForSession: (sid) => ctx.registry.get(sid),
  });
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

const RELAY_POLITE_CLOSE_PHASE_MS = 2000;

export async function createRelayServer(opts: {
  dbPath: string;
  port?: number;
  pepper?: string;
  relayGenerationToken?: string;
  idleShutdownMs?: number;
  onIdleShutdown?: () => void | Promise<void>;
  presenceStaleAfterMs?: number;
}): Promise<{ url: string; dbPath: string; close: () => Promise<void> }> {
  const db = openDatabase(opts.dbPath);
  migrate(db);
  const pepper =
    opts.pepper ??
    process.env.AGENT_TALKIE_RECONNECT_PEPPER ??
    "dev-reconnect-pepper";

  const registry = new SessionRegistry();
  const destroyedSlugs = new Map<string, number>();
  const connStates = new Map<WebSocket, ConnState>();
  const presenceStaleAfterMs = opts.presenceStaleAfterMs ?? 120000;

  const server = http.createServer();
  const wss = new WebSocketServer({ server });

  const token = opts.relayGenerationToken;

  let idleTimer: NodeJS.Timeout | undefined;
  function clearIdle(): void {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  }

  let scheduleIdle: () => void = () => {};
  const idleShutdownEnabled =
    opts.idleShutdownMs !== undefined &&
    Number.isFinite(opts.idleShutdownMs) &&
    opts.idleShutdownMs >= 0 &&
    typeof opts.onIdleShutdown === "function";
  if (idleShutdownEnabled) {
    const idleMs = opts.idleShutdownMs as number;
    const onIdleShutdown = opts.onIdleShutdown as () => void | Promise<void>;
    scheduleIdle = () => {
      clearIdle();
      if (wss.clients.size === 0) {
        idleTimer = setTimeout(() => {
          void Promise.resolve(onIdleShutdown()).catch((err) => {
            console.error("onIdleShutdown failed", err);
          });
        }, idleMs);
      }
    };
  }

  let spaceGcInterval: ReturnType<typeof setInterval> | undefined;
  let boundPort: number | undefined;
  const restartSupported = basename(opts.dbPath) === "relay.sqlite";
  const onlineSessionIds = (): Set<string> => {
    const ids = new Set<string>();
    for (const [client, state] of connStates) {
      if (client.readyState === client.OPEN && state.boundSessionId !== null) {
        ids.add(state.boundSessionId);
      }
    }
    return ids;
  };

  const pruneStaleMemberships = (): void => {
    pruneStaleDisconnectedMemberships(db, {
      nowMs: Date.now(),
      staleAfterMs: presenceStaleAfterMs * 3,
      onlineSessionIds: onlineSessionIds(),
    });
  };

  const classifySpaceActionability = (
    slug: string,
    onlineIds: ReadonlySet<string>,
    nowMs: number,
  ): SpaceActionability => {
    const summary = getOversightSpaceSummaryBySlug(db, slug);
    if (summary === undefined || summary.memberCount === 0) {
      return {
        state: "blocked",
        reason: "empty_space",
        label: "No active members",
        detail: "No active participant can receive messages in this space.",
      };
    }
    if (summary.orchestratorSessionId === null) {
      return {
        state: "blocked",
        reason: "no_orchestrator",
        label: "No orchestrator",
        detail: "Default dashboard messages need an orchestrator target.",
      };
    }
    const orchestrator = summary.members.find(
      (member) => member.sessionId === summary.orchestratorSessionId,
    );
    if (orchestrator === undefined) {
      return {
        state: "blocked",
        reason: "orchestrator_missing",
        label: "Orchestrator missing",
        detail: "The selected orchestrator is not an active member.",
      };
    }
    if (onlineIds.has(orchestrator.sessionId)) {
      return {
        state: "ready",
        reason: "ready",
        label: "Ready",
        detail: "The orchestrator is online.",
      };
    }
    if (
      orchestrator.lastSeenAtMs !== null &&
      nowMs - orchestrator.lastSeenAtMs > presenceStaleAfterMs
    ) {
      if (isPullMode(orchestrator.inboxMode)) {
        return {
          state: "manual-pull",
          reason: "orchestrator_manual_pull",
          label: "Manual pull",
          detail:
            "The orchestrator is pull-based and will receive messages on its next pull.",
        };
      }
      return {
        state: "blocked",
        reason: "orchestrator_stale",
        label: "Orchestrator stale",
        detail: "The orchestrator has not checked in recently.",
      };
    }
    if (isPullMode(orchestrator.inboxMode)) {
      return {
        state: "manual-pull",
        reason: "orchestrator_manual_pull",
        label: "Manual pull",
        detail:
          "The orchestrator is pull-based and will receive messages on its next pull.",
      };
    }
    return {
      state: "blocked",
      reason: "orchestrator_offline",
      label: "Orchestrator offline",
      detail: "The orchestrator is not currently connected.",
    };
  };

  const spawnReplacementRelay = (): void => {
    if (!restartSupported || boundPort === undefined) {
      return;
    }
    const daemonEntry = require.resolve("@agent-talkie/relay/daemon");
    const child = fork(daemonEntry, [], {
      env: {
        ...process.env,
        AGENT_TALKIE_DATA_DIR: dirname(opts.dbPath),
        AGENT_TALKIE_RELAY_PORT: String(boundPort),
      },
      detached: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      execArgv: [],
    });
    child.once("message", () => {
      if (child.connected) {
        child.disconnect();
      }
    });
    child.unref();
  };

  let closePromise: Promise<void> | null = null;
  const gracefulClose = (): Promise<void> => {
    closePromise ??= new Promise((resolve, reject) => {
      if (spaceGcInterval !== undefined) {
        clearInterval(spaceGcInterval);
      }
      clearIdle();
      void (async () => {
        try {
          for (const client of wss.clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.close(1001, "relay_shutdown");
            }
          }
          const deadline = Date.now() + RELAY_POLITE_CLOSE_PHASE_MS;
          while (Date.now() < deadline) {
            let anyActive = false;
            for (const c of wss.clients) {
              if (
                c.readyState === WebSocket.OPEN ||
                c.readyState === WebSocket.CONNECTING
              ) {
                anyActive = true;
                break;
              }
            }
            if (!anyActive) {
              break;
            }
            await new Promise<void>((r) => {
              setTimeout(r, 25);
            });
          }
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
        } catch (err) {
          reject(err);
        }
      })();
    });
    return closePromise;
  };

  server.on("request", (req, res) => {
    if ((req.headers.upgrade ?? "").toLowerCase() === "websocket") {
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/__agent-talkie/v1/")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    if (idleShutdownEnabled) {
      clearIdle();
      const onHttpActivityEnd = (): void => {
        if (wss.clients.size === 0) {
          scheduleIdle();
        }
      };
      res.once("finish", onHttpActivityEnd);
      res.once("close", onHttpActivityEnd);
    }

    if (
      url.pathname === "/__agent-talkie/v1/health" &&
      typeof token === "string" &&
      token.length > 0
    ) {
      if (req.method === "GET") {
        const gen = url.searchParams.get("generation");
        if (gen === token) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, generation: token }));
        } else {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false }));
        }
        return;
      }
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/__agent-talkie/v1/oversight/space-summary"
    ) {
      const slug = url.searchParams.get("slug");
      if (!slug) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "missing_slug" }));
        return;
      }
      pruneStaleMemberships();
      const summary = getOversightSpaceSummaryBySlug(db, slug);
      if (summary === undefined) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "space_not_found" }));
        return;
      }
      const onlineIds = onlineSessionIds();
      const now = Date.now();
      const withPresence = {
        ...summary,
        members: summary.members.map((member) => {
          let presenceState: "online" | "offline" | "stale" = "offline";
          if (onlineIds.has(member.sessionId)) {
            presenceState = "online";
          } else if (
            member.lastSeenAtMs !== null &&
            now - member.lastSeenAtMs > presenceStaleAfterMs
          ) {
            presenceState = "stale";
          }
          return { ...member, presenceState };
        }),
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(withPresence));
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/__agent-talkie/v1/relay/status"
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          running: true,
          activeConnectionCount: wss.clients.size,
          stopSupported: true,
          restartSupported,
        }),
      );
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname === "/__agent-talkie/v1/relay/restart"
    ) {
      if (!restartSupported) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "restart_unsupported" }));
        return;
      }
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => {
        void gracefulClose()
          .then(() => {
            spawnReplacementRelay();
          })
          .catch(() => {});
      }, 0);
      return;
    }

    if (
      req.method === "POST" &&
      url.pathname === "/__agent-talkie/v1/relay/stop"
    ) {
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => {
        void gracefulClose().catch(() => {});
      }, 0);
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname === "/__agent-talkie/v1/oversight/spaces"
    ) {
      pruneStaleMemberships();
      const onlineIds = onlineSessionIds();
      const now = Date.now();
      const rows = listOversightSpaces(db).map((row) => ({
        ...row,
        actionability: classifySpaceActionability(row.slug, onlineIds, now),
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(rows));
      return;
    }

    if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) {
      const assets = getDashboardSirv();
      const originalUrl = req.url;
      const under = url.pathname.slice("/dashboard".length) || "/";
      req.url = under + url.search;
      const restoreUrl = () => {
        req.url = originalUrl;
      };
      res.once("finish", restoreUrl);
      res.once("close", restoreUrl);
      assets(req, res, () => {
        restoreUrl();
        res.statusCode = 404;
        res.end();
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  spaceGcInterval = setInterval(() => {
    try {
      pruneStaleMemberships();
      pruneExpiredArchivedSpaces(db, Date.now());
    } catch {
      /* ignore */
    }
  }, 60000);

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
          reconnectSecret: newSecret,
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
        destroyedSlugs,
      },
      envelope,
    );
  };

  wss.on("connection", (ws: WebSocket) => {
    clearIdle();
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
      if (wss.clients.size === 0) {
        scheduleIdle();
      }
    });
    ws.on("error", () => {
      registry.remove(ws);
      connStates.delete(ws);
      if (wss.clients.size === 0) {
        scheduleIdle();
      }
    });
  });

  const listenPort = opts.port !== undefined ? opts.port : DEFAULT_RELAY_PORT;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, LISTEN_HOST, () => {
      server.off("error", reject);
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        boundPort = address.port;
      }
      resolve();
    });
  });

  const addr = server.address();
  const actualPort =
    typeof addr === "object" && addr !== null ? addr.port : listenPort;

  if (idleShutdownEnabled) {
    scheduleIdle();
  }

  return {
    url: `ws://${LISTEN_HOST}:${actualPort}`,
    dbPath: opts.dbPath,
    close: gracefulClose,
  };
}
