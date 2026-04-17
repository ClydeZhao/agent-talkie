import { spawn as defaultSpawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Writable } from "node:stream";
import {
  ContentLengthFrameReader,
  MAX_FRAME_BODY_BYTES,
  createBoundedQueue,
} from "@agent-talkie/adapter-stdio";
import { TalkieSessionClient } from "@agent-talkie/client";
import {
  safeParseEnvelope,
  type Envelope,
} from "@agent-talkie/protocol";
import {
  ensureRelayRunning as defaultEnsureRelay,
  resolveAgentTalkieDataDir,
} from "@agent-talkie/supervisor";

export type EnsureRelayRunning = (opts: Record<string, unknown>) => Promise<{
  port: number;
}>;

const BLOCKED_LINE_RE = /\b(permission|approval|confirm)\b/i;
const CODEX_SESSION_STATE_FILE = "adapter-codex-session-state.json";

type PersistedSessionState = {
  sessionId: string;
  reconnectSecret: string;
};

function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function shouldForwardToChild(
  envelope: Envelope,
  registeredSessionId: string,
): boolean {
  const routed =
    envelope.sessionId === registeredSessionId ||
    envelope.to === registeredSessionId;
  if (!routed) {
    return false;
  }
  if (envelope.kind === "conversation") {
    return true;
  }
  if (envelope.kind === "control") {
    const t = envelope.type;
    if (t.startsWith("task.")) {
      return true;
    }
    if (t === "metadata.patch" || t === "metadata.query") {
      return true;
    }
    if (t.startsWith("orchestrator.")) {
      return true;
    }
    return false;
  }
  return false;
}

function codexSessionStatePath(): string {
  return join(resolveAgentTalkieDataDir(), CODEX_SESSION_STATE_FILE);
}

function loadPersistedSessionState(
  path: string,
): PersistedSessionState | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { sessionId?: unknown }).sessionId === "string" &&
      typeof (parsed as { reconnectSecret?: unknown }).reconnectSecret ===
        "string"
    ) {
      return {
        sessionId: (parsed as { sessionId: string }).sessionId,
        reconnectSecret: (parsed as { reconnectSecret: string }).reconnectSecret,
      };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function persistSessionState(path: string, state: PersistedSessionState): void {
  mkdirSync(resolveAgentTalkieDataDir(), { recursive: true });
  writeFileSync(path, JSON.stringify(state), "utf8");
}

function clearPersistedSessionState(path: string): void {
  rmSync(path, { force: true });
}

async function writeFramedEnvelope(stdin: Writable, envelope: Envelope): Promise<void> {
  const bodyBuf = Buffer.from(JSON.stringify(envelope), "utf8");
  if (bodyBuf.length > MAX_FRAME_BODY_BYTES) {
    console.error(
      JSON.stringify({ event: "adapter_codex_downstream_frame_too_large" }),
    );
    return;
  }
  const header = Buffer.from(
    `Content-Length: ${bodyBuf.length}\r\n\r\n`,
    "utf8",
  );
  const chunk = Buffer.concat([header, bodyBuf]);
  const ok = stdin.write(chunk);
  if (!ok) {
    await new Promise<void>((resolve) => stdin.once("drain", resolve));
  }
}

export async function runCodexAdapter(opts?: {
  spawn?: typeof defaultSpawn;
  ensureRelay?: EnsureRelayRunning;
  TalkieSessionClient?: typeof TalkieSessionClient;
}): Promise<void> {
  const spawnFn = opts?.spawn ?? defaultSpawn;
  const ensureRelay = opts?.ensureRelay ?? defaultEnsureRelay;
  const ClientClass = opts?.TalkieSessionClient ?? TalkieSessionClient;

  let argv: string[] = [];
  const argsJson = process.env.TALKIE_CODEX_ARGS_JSON;
  if (argsJson !== undefined && argsJson !== "") {
    try {
      const parsed = JSON.parse(argsJson) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
        throw new Error("TALKIE_CODEX_ARGS_JSON must be a JSON array of strings");
      }
      argv = [...parsed];
    } catch (e) {
      process.stderr.write(
        `[adapter-codex] invalid TALKIE_CODEX_ARGS_JSON: ${e instanceof Error ? e.message : String(e)}\n`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const relay = await ensureRelay({});
  const statePath = codexSessionStatePath();
  const sessionInput = {
    displayName: process.env.TALKIE_CODEX_DISPLAY_NAME ?? "codex-adapter",
    runtime: process.env.TALKIE_CODEX_RUNTIME ?? "adapter-codex",
    workspaceLabel: process.env.TALKIE_CODEX_WORKSPACE ?? ".",
    isHuman: false,
  } as const;
  const connectClient = async (): Promise<TalkieSessionClient> => {
    const next = new ClientClass({
      url: `ws://127.0.0.1:${relay.port}`,
    });
    await next.connect();
    return next;
  };

  let client = await connectClient();
  let registeredSessionId: string;
  const persisted = loadPersistedSessionState(statePath);
  if (persisted) {
    try {
      const resumed = await client.resume(persisted);
      persistSessionState(statePath, resumed);
      registeredSessionId = resumed.sessionId;
    } catch {
      clearPersistedSessionState(statePath);
      client.close();
      client = await connectClient();
      const reg = await client.registerSession(sessionInput);
      persistSessionState(statePath, {
        sessionId: reg.sessionId,
        reconnectSecret: reg.reconnectSecret,
      });
      registeredSessionId = reg.sessionId;
    }
  } else {
    const reg = await client.registerSession(sessionInput);
    persistSessionState(statePath, {
      sessionId: reg.sessionId,
      reconnectSecret: reg.reconnectSecret,
    });
    registeredSessionId = reg.sessionId;
  }

  let activeSpaceId: string | null = null;
  const joinSlug = process.env.TALKIE_CODEX_JOIN_SLUG?.trim();
  if (joinSlug) {
    const joined = await client.joinSpace({
      slug: joinSlug,
      idempotencyKey: randomUUID(),
    });
    activeSpaceId = joined.spaceId;
  } else {
    const sid = process.env.TALKIE_CODEX_SPACE_ID?.trim();
    if (sid && looksLikeUuid(sid)) {
      activeSpaceId = sid;
    }
  }

  const cmd = process.env.TALKIE_CODEX_COMMAND ?? "codex";
  const child = spawnFn(cmd, argv, { stdio: ["pipe", "pipe", "pipe"] }) as ChildProcess;

  const stdin = child.stdin!;
  const queue = createBoundedQueue<Envelope>(100);
  let draining = false;

  const kickDrain = (): void => {
    if (draining) {
      return;
    }
    draining = true;
    setImmediate(() => {
      void (async () => {
        try {
          while (queue.length > 0) {
            const env = queue.shift();
            if (env) {
              await writeFramedEnvelope(stdin, env);
            }
          }
        } finally {
          draining = false;
          if (queue.length > 0) {
            kickDrain();
          }
        }
      })();
    });
  };

  client.onEnvelope((envelope) => {
    if (!shouldForwardToChild(envelope, registeredSessionId)) {
      return;
    }
    queue.enqueue(envelope, () => {
      process.stderr.write(
        `${JSON.stringify({
          level: "warn",
          event: "adapter_codex_stdin_backpressure_drop",
        })}\n`,
      );
    });
    kickDrain();
  });

  let lastBlockedSentMs = 0;
  let noSpaceWarned = false;
  let stderrCarry = "";

  const stderrLoop = async (): Promise<void> => {
    const err = child.stderr;
    if (!err) {
      return;
    }
    for await (const chunk of err) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      stderrCarry += text;
      const parts = stderrCarry.split("\n");
      stderrCarry = parts.pop() ?? "";
      for (const line of parts) {
        if (line === "") {
          continue;
        }
        if (!BLOCKED_LINE_RE.test(line)) {
          continue;
        }
        const now = Date.now();
        if (now - lastBlockedSentMs < 5000) {
          continue;
        }
        if (activeSpaceId === null) {
          if (!noSpaceWarned) {
            noSpaceWarned = true;
            process.stderr.write(
              `${JSON.stringify({
                level: "warn",
                event: "adapter_codex_no_space",
              })}\n`,
            );
          }
          continue;
        }
        lastBlockedSentMs = now;
        client.sendEnvelope({
          version: 1,
          id: randomUUID(),
          sessionId: registeredSessionId,
          kind: "control",
          type: "metadata.patch",
          spaceId: activeSpaceId,
          idempotencyKey: randomUUID(),
          payload: {
            namespace: "status",
            patch: {
              progress: "blocked",
              blockedReason: line.slice(0, 512),
            },
          },
        });
      }
    }
  };

  const stdoutLoop = async (): Promise<void> => {
    const out = child.stdout;
    if (!out) {
      return;
    }
    const reader = new ContentLengthFrameReader(out);
    for await (const obj of reader) {
      const parsed = safeParseEnvelope(obj);
      if (parsed.success) {
        client.sendEnvelope(parsed.data);
      }
    }
  };

  await Promise.all([stdoutLoop(), stderrLoop(), waitChildExit(child)]);
  client.close();
}

function waitChildExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
  });
}
