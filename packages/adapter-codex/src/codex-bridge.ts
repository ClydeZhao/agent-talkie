import { spawn as defaultSpawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TalkieSessionClient } from "@agent-talkie/client";
import type { Envelope } from "@agent-talkie/protocol";
import {
  ensureRelayRunning as defaultEnsureRelay,
  resolveAgentTalkieDataDir,
} from "@agent-talkie/supervisor";

export type EnsureRelayRunning = (opts: Record<string, unknown>) => Promise<{
  port: number;
}>;

const CODEX_SESSION_STATE_FILE = "adapter-codex-session-state.json";
const CODEX_THREAD_STATE_FILE = "adapter-codex-thread-state.json";
const BLOCKED_LINE_RE =
  /\b(permission|approval|approve|confirm|confirmation|blocked|interrupt(?:ed|ion)?|cancel(?:ed|led|ation)?)\b/i;
const INTERNAL_CODEX_GOALS_WARNING_RE = /\bcodex_core::goals\b.*\bthread_goals\b/i;

type PersistedSessionState = {
  sessionId: string;
  reconnectSecret: string;
  identity?: SessionIdentity;
};

type PersistedThreadState = {
  spaces: Record<string, { threadId: string }>;
};

type SessionIdentity = {
  displayName: string;
  runtime: string;
  workspaceLabel: string;
  isHuman: boolean;
};

type SpawnResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
};

type TurnRun = {
  promise: Promise<void>;
  child?: ChildProcess;
};

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionIdentity(value: unknown): value is SessionIdentity {
  return (
    isRecord(value) &&
    typeof value.displayName === "string" &&
    typeof value.runtime === "string" &&
    typeof value.workspaceLabel === "string" &&
    typeof value.isHuman === "boolean"
  );
}

function sameSessionIdentity(
  a: SessionIdentity | undefined,
  b: SessionIdentity,
): boolean {
  return (
    a !== undefined &&
    a.displayName === b.displayName &&
    a.runtime === b.runtime &&
    a.workspaceLabel === b.workspaceLabel &&
    a.isHuman === b.isHuman
  );
}

function normalizeText(value: string): string | undefined {
  const text = value.trim();
  return text === "" ? undefined : text;
}

function shouldReportBlockedStderrLine(line: string): boolean {
  return (
    BLOCKED_LINE_RE.test(line) && !INTERNAL_CODEX_GOALS_WARNING_RE.test(line)
  );
}

function resolveSessionStatePath(): string {
  return join(resolveAgentTalkieDataDir(), CODEX_SESSION_STATE_FILE);
}

function resolveThreadStatePath(): string {
  return join(resolveAgentTalkieDataDir(), CODEX_THREAD_STATE_FILE);
}

function loadPersistedSessionState(
  path: string,
): PersistedSessionState | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (
      isRecord(parsed) &&
      typeof parsed.sessionId === "string" &&
      typeof parsed.reconnectSecret === "string"
    ) {
      return {
        sessionId: parsed.sessionId,
        reconnectSecret: parsed.reconnectSecret,
        identity: isSessionIdentity(parsed.identity)
          ? parsed.identity
          : undefined,
      };
    }
  } catch {
    /* ignore invalid state */
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

function isAlreadyInSpaceError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("already_in_space");
}

function loadPersistedThreadState(path: string): PersistedThreadState {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.spaces)) {
      return { spaces: {} };
    }
    const spaces: PersistedThreadState["spaces"] = {};
    for (const [spaceId, value] of Object.entries(parsed.spaces)) {
      if (isRecord(value) && typeof value.threadId === "string") {
        spaces[spaceId] = { threadId: value.threadId };
      }
    }
    return { spaces };
  } catch {
    return { spaces: {} };
  }
}

function persistThreadState(path: string, state: PersistedThreadState): void {
  mkdirSync(resolveAgentTalkieDataDir(), { recursive: true });
  writeFileSync(path, JSON.stringify(state), "utf8");
}

function parseExtraArgs(): string[] {
  const argsJson = process.env.TALKIE_CODEX_ARGS_JSON;
  if (argsJson === undefined || argsJson.trim() === "") {
    return [];
  }
  const parsed = JSON.parse(argsJson) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
    throw new Error("TALKIE_CODEX_ARGS_JSON must be a JSON array of strings");
  }
  return [...parsed];
}

function getThreadIdForSpace(
  state: PersistedThreadState,
  spaceId: string,
): string | undefined {
  return state.spaces[spaceId]?.threadId;
}

function setThreadIdForSpace(
  state: PersistedThreadState,
  path: string,
  spaceId: string,
  threadId: string,
): void {
  const current = state.spaces[spaceId]?.threadId;
  if (current === threadId) {
    return;
  }
  state.spaces[spaceId] = { threadId };
  persistThreadState(path, state);
}

function shouldHandleConversation(
  envelope: Envelope,
  registeredSessionId: string,
): envelope is Envelope & {
  kind: "conversation";
  type: "chat.message" | "chat.direct";
  payload: { text: string };
  spaceId: string;
} {
  if (
    envelope.kind !== "conversation" ||
    (envelope.type !== "chat.message" && envelope.type !== "chat.direct") ||
    envelope.sessionId === registeredSessionId
  ) {
    return false;
  }
  if (envelope.to !== undefined && envelope.to !== registeredSessionId) {
    return false;
  }
  if (typeof envelope.spaceId !== "string" || envelope.spaceId === "") {
    return false;
  }
  const payload = envelope.payload as { text?: unknown } | undefined;
  return typeof payload?.text === "string" && payload.text.trim() !== "";
}

function buildCodexArgs(
  prompt: string,
  extraArgs: string[],
  threadId?: string,
): string[] {
  if (threadId) {
    return ["exec", "--json", ...extraArgs, "resume", threadId, prompt];
  }
  return ["exec", "--json", ...extraArgs, prompt];
}

function extractTextChunks(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const chunks: string[] = [];
  for (const item of content) {
    if (!isRecord(item) || typeof item.text !== "string") {
      continue;
    }
    if (typeof item.type === "string" && !item.type.toLowerCase().includes("text")) {
      continue;
    }
    chunks.push(item.text);
  }
  return chunks;
}

function extractAgentMessageText(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    typeof value.type === "string" &&
    value.type !== "agent_message" &&
    value.type !== "assistant_message" &&
    value.type !== "message"
  ) {
    const nestedAgentMessage = extractAgentMessageText(value.agent_message);
    if (nestedAgentMessage) {
      return nestedAgentMessage;
    }
  }

  if (typeof value.text === "string") {
    const direct = normalizeText(value.text);
    if (direct) {
      return direct;
    }
  }

  const contentText = normalizeText(extractTextChunks(value.content).join(""));
  if (contentText) {
    return contentText;
  }

  return extractAgentMessageText(value.message);
}

function parseJsonLine(line: string): unknown | undefined {
  const trimmed = line.trim();
  if (trimmed === "") {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

async function readJsonLines(
  stream: NodeJS.ReadableStream | null | undefined,
  onEvent: (event: unknown) => void,
): Promise<void> {
  if (!stream) {
    return;
  }
  let carry = "";
  for await (const chunk of stream) {
    carry += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    const lines = carry.split(/\r?\n/);
    carry = lines.pop() ?? "";
    for (const line of lines) {
      const parsed = parseJsonLine(line);
      if (parsed !== undefined) {
        onEvent(parsed);
      }
    }
  }
  const trailing = parseJsonLine(carry);
  if (trailing !== undefined) {
    onEvent(trailing);
  }
}

async function readStderrLines(
  stream: NodeJS.ReadableStream | null | undefined,
  onLine: (line: string) => void,
): Promise<void> {
  if (!stream) {
    return;
  }
  let carry = "";
  for await (const chunk of stream) {
    carry += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    const lines = carry.split(/\r?\n/);
    carry = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed !== "") {
        onLine(trimmed);
      }
    }
  }
  const trailing = carry.trim();
  if (trailing !== "") {
    onLine(trailing);
  }
}

function waitForChild(child: ChildProcess): Promise<SpawnResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: SpawnResult) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };
    child.once("error", (error) => {
      finish({ exitCode: null, signal: null, error });
    });
    child.once("exit", (exitCode, signal) => {
      finish({ exitCode, signal });
    });
  });
}

function waitForAbort(signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise(() => {});
  }
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function sendBlockedMetadata(
  client: TalkieSessionClient,
  sessionId: string,
  spaceId: string,
  blockedReason: string,
): void {
  client.sendEnvelope({
    version: 1,
    id: randomUUID(),
    sessionId,
    kind: "control",
    type: "metadata.patch",
    spaceId,
    payload: {
      namespace: "status",
      patch: {
        progress: "blocked",
        blockedReason: blockedReason.slice(0, 512),
      },
    },
  });
}

export async function runCodexAdapter(opts?: {
  spawn?: typeof defaultSpawn;
  ensureRelay?: EnsureRelayRunning;
  TalkieSessionClient?: typeof TalkieSessionClient;
  signal?: AbortSignal;
  onReady?: (state: { sessionId: string }) => void;
}): Promise<void> {
  const spawnFn = opts?.spawn ?? defaultSpawn;
  const ensureRelay = opts?.ensureRelay ?? defaultEnsureRelay;
  const ClientClass = opts?.TalkieSessionClient ?? TalkieSessionClient;

  let extraArgs: string[];
  try {
    extraArgs = parseExtraArgs();
  } catch (error) {
    process.stderr.write(
      `[adapter-codex] invalid TALKIE_CODEX_ARGS_JSON: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const relay = await ensureRelay({});
  const sessionStatePath = resolveSessionStatePath();
  const threadStatePath = resolveThreadStatePath();
  const threadState = loadPersistedThreadState(threadStatePath);
  const sessionInput = {
    displayName: process.env.TALKIE_CODEX_DISPLAY_NAME ?? "codex-adapter",
    runtime: process.env.TALKIE_CODEX_RUNTIME ?? "adapter-codex",
    workspaceLabel: process.env.TALKIE_CODEX_WORKSPACE_LABEL ?? ".",
    isHuman: false,
  } satisfies SessionIdentity;

  const connectClient = async (): Promise<TalkieSessionClient> => {
    const client = new ClientClass({
      url: `ws://127.0.0.1:${relay.port}`,
    });
    await client.connect();
    return client;
  };

  const registerNewSession = async (client: TalkieSessionClient): Promise<string> => {
    const reg = await client.registerSession({
      ...sessionInput,
      inboxMode: "live",
    });
    persistSessionState(sessionStatePath, {
      sessionId: reg.sessionId,
      reconnectSecret: reg.reconnectSecret,
      identity: sessionInput,
    });
    return reg.sessionId;
  };

  const connectAndRegisterNewSession = async (): Promise<{
    client: TalkieSessionClient;
    sessionId: string;
  }> => {
    const freshClient = await connectClient();
    return {
      client: freshClient,
      sessionId: await registerNewSession(freshClient),
    };
  };

  let client = await connectClient();
  let registeredSessionId: string;
  let resumedPersistedSession = false;
  let joinedSlug: string | undefined;
  const persistedSession = loadPersistedSessionState(sessionStatePath);
  if (
    persistedSession &&
    sameSessionIdentity(persistedSession.identity, sessionInput)
  ) {
    try {
      const resumed = await client.resume({
        sessionId: persistedSession.sessionId,
        reconnectSecret: persistedSession.reconnectSecret,
      });
      persistSessionState(sessionStatePath, {
        ...resumed,
        identity: sessionInput,
      });
      registeredSessionId = resumed.sessionId;
      resumedPersistedSession = true;
    } catch {
      clearPersistedSessionState(sessionStatePath);
      client.close();
      const fresh = await connectAndRegisterNewSession();
      client = fresh.client;
      registeredSessionId = fresh.sessionId;
    }
  } else {
    if (persistedSession) {
      clearPersistedSessionState(sessionStatePath);
    }
    registeredSessionId = await registerNewSession(client);
  }

  if (process.env.TALKIE_CODEX_JOIN_SLUG?.trim()) {
    const slug = process.env.TALKIE_CODEX_JOIN_SLUG.trim();
    try {
      await client.joinSpace({
        slug,
        idempotencyKey: randomUUID(),
      });
      joinedSlug = slug;
    } catch (error) {
      if (!resumedPersistedSession || !isAlreadyInSpaceError(error)) {
        throw error;
      }
      clearPersistedSessionState(sessionStatePath);
      client.close();
      const fresh = await connectAndRegisterNewSession();
      client = fresh.client;
      registeredSessionId = fresh.sessionId;
      await client.joinSpace({
        slug,
        idempotencyKey: randomUUID(),
      });
      joinedSlug = slug;
    }
  } else {
    const fallbackSpaceId = process.env.TALKIE_CODEX_SPACE_ID?.trim();
    if (fallbackSpaceId && !looksLikeUuid(fallbackSpaceId)) {
      process.stderr.write(
        `[adapter-codex] ignoring invalid TALKIE_CODEX_SPACE_ID: ${fallbackSpaceId}\n`,
      );
    }
  }

  const cmd = process.env.TALKIE_CODEX_COMMAND ?? "codex";
  const activeTurns = new Map<string, TurnRun>();
  let shuttingDown = false;
  let resolveLifecycleStop: (() => void) | undefined;
  const lifecycleStop = new Promise<void>((resolve) => {
    resolveLifecycleStop = resolve;
  });

  const requestLifecycleStop = (reason: string): void => {
    if (shuttingDown) {
      return;
    }
    process.stderr.write(`[adapter-codex] stopping sidecar: ${reason}\n`);
    resolveLifecycleStop?.();
  };

  client.onRelayMessage((message: unknown) => {
    if (!isRecord(message) || typeof message.type !== "string") {
      return;
    }
    if (
      (message.type === "space.archived" || message.type === "space.destroyed") &&
      joinedSlug !== undefined &&
      message.slug === joinedSlug
    ) {
      requestLifecycleStop(`${message.type} ${joinedSlug}`);
      return;
    }
    if (
      message.type === "membership.removed" &&
      message.targetSessionId === registeredSessionId
    ) {
      requestLifecycleStop("membership.removed");
    }
  });

  const startTurn = (envelope: Envelope): void => {
    if (!shouldHandleConversation(envelope, registeredSessionId)) {
      return;
    }
    if (shuttingDown) {
      return;
    }

    const prompt = envelope.payload.text.trim();
    const spaceId = envelope.spaceId;
    const replyTo =
      envelope.type === "chat.direct" ? envelope.sessionId : undefined;
    if (activeTurns.has(spaceId)) {
      sendBlockedMetadata(
        client,
        registeredSessionId,
        spaceId,
        "Codex turn already running for this space",
      );
      return;
    }

    const threadId = getThreadIdForSpace(threadState, spaceId);
    const child = spawnFn(cmd, buildCodexArgs(prompt, extraArgs, threadId), {
      stdio: ["ignore", "pipe", "pipe"],
    }) as ChildProcess;

    const blockedLines = new Set<string>();
    let latestReply: string | undefined;
    let turnCompleted = false;
    let reportedJsonError = false;

    const promise = (async () => {
      const stdoutPromise = readJsonLines(child.stdout, (event) => {
        if (!isRecord(event) || typeof event.type !== "string") {
          return;
        }

        if (event.type === "error") {
          if (!reportedJsonError && typeof event.message === "string") {
            reportedJsonError = true;
            sendBlockedMetadata(
              client,
              registeredSessionId,
              spaceId,
              `Codex error: ${event.message}`,
            );
          }
          return;
        }

        if (event.type === "thread.started" && typeof event.thread_id === "string") {
          setThreadIdForSpace(threadState, threadStatePath, spaceId, event.thread_id);
          return;
        }

        if (event.type === "item.completed") {
          if (turnCompleted) {
            return;
          }
          const reply = extractAgentMessageText(event.item);
          if (reply) {
            latestReply = reply;
          }
          return;
        }

        if (event.type === "turn.completed") {
          turnCompleted = true;
        }
      });

      const stderrPromise = readStderrLines(child.stderr, (line) => {
        if (!shouldReportBlockedStderrLine(line)) {
          return;
        }
        if (blockedLines.has(line)) {
          return;
        }
        blockedLines.add(line);
        sendBlockedMetadata(client, registeredSessionId, spaceId, line);
      });

      const [result] = await Promise.all([
        waitForChild(child),
        stdoutPromise,
        stderrPromise,
      ]);

      if (shuttingDown) {
        return;
      }

      if (turnCompleted && latestReply) {
        client.sendEnvelope({
          version: 1,
          id: randomUUID(),
          sessionId: registeredSessionId,
          kind: "conversation",
          type: replyTo === undefined ? "chat.message" : "chat.direct",
          spaceId,
          ...(replyTo === undefined ? {} : { to: replyTo }),
          payload: { text: latestReply },
        });
        return;
      }

      if (result.error) {
        process.stderr.write(
          `[adapter-codex] failed to start Codex: ${result.error.message}\n`,
        );
        return;
      }

      if (result.exitCode !== null && result.exitCode !== 0) {
        process.stderr.write(
          `[adapter-codex] Codex exited with code ${result.exitCode} for space ${spaceId}\n`,
        );
        return;
      }

      if (result.signal !== null) {
        process.stderr.write(
          `[adapter-codex] Codex exited via signal ${result.signal} for space ${spaceId}\n`,
        );
      }
    })().finally(() => {
      activeTurns.delete(spaceId);
    });

    activeTurns.set(spaceId, { child, promise });
  };

  client.onEnvelope(startTurn);
  opts?.onReady?.({ sessionId: registeredSessionId });

  try {
    await Promise.race([waitForAbort(opts?.signal), lifecycleStop]);
  } finally {
    shuttingDown = true;
    for (const turn of activeTurns.values()) {
      try {
        turn.child?.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    await Promise.allSettled(
      [...activeTurns.values()].map((turn) => turn.promise),
    );
    client.close();
  }
}
