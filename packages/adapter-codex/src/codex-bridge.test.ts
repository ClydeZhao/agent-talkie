import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import type { TalkieSessionClient } from "@agent-talkie/client";
import type { Envelope } from "@agent-talkie/protocol";
import { runCodexAdapter } from "./codex-bridge.js";

const REG_SID = uuidv7();
const HUMAN_SID = uuidv7();
const SPACE_SID = uuidv7();
const SPACE_SID_2 = uuidv7();
const THREAD_ID = uuidv4();
const THREAD_ID_2 = uuidv4();
const CODEX_SESSION_STATE_FILE = "adapter-codex-session-state.json";
const CODEX_THREAD_STATE_FILE = "adapter-codex-thread-state.json";
const DEFAULT_CODEX_SESSION_IDENTITY = {
  displayName: "codex-adapter",
  runtime: "adapter-codex",
  workspaceLabel: ".",
  isHuman: false,
};

type MockChild = ChildProcess & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
};

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(fn: () => boolean): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    if (fn()) {
      return;
    }
    await flushMicrotasks();
  }
  throw new Error("condition_not_met");
}

function createMockChild(): MockChild {
  const emitter = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
  };
  emitter.stdin = new PassThrough();
  emitter.stdout = new PassThrough();
  emitter.stderr = new PassThrough();
  return emitter as unknown as MockChild;
}

function writeJsonLines(stream: PassThrough, events: unknown[]): void {
  for (const event of events) {
    stream.write(`${JSON.stringify(event)}\n`);
  }
}

function finishChild(child: MockChild, exitCode: number): void {
  child.stdout.end();
  child.stderr.end();
  child.emit("exit", exitCode, null);
}

function writePersistedSessionState(
  dataDir: string,
  overrides?: {
    identity?: unknown;
    reconnectSecret?: string;
  },
): void {
  writeFileSync(
    join(dataDir, CODEX_SESSION_STATE_FILE),
    JSON.stringify({
      sessionId: REG_SID,
      reconnectSecret: overrides?.reconnectSecret ?? "stored-secret",
      identity: overrides?.identity ?? DEFAULT_CODEX_SESSION_IDENTITY,
    }),
    "utf8",
  );
}

class MockTalkieSessionClient {
  readonly handlers = new Set<(e: Envelope) => void>();
  connect = vi.fn(async () => {});
  registerSession = vi.fn(async () => ({
    sessionId: REG_SID,
    reconnectSecret: "r",
    displayName: "codex-adapter",
  }));
  resume = vi.fn(async () => ({
    sessionId: REG_SID,
    reconnectSecret: "r2",
  }));
  joinSpace = vi.fn(async () => ({
    spaceId: SPACE_SID,
    slug: "demo",
  }));
  sendEnvelope = vi.fn();
  onEnvelope = vi.fn((handler: (e: Envelope) => void) => {
    this.handlers.add(handler);
  });
  close = vi.fn();
  constructor(_opts?: { url?: string }) {
    void _opts;
  }
  deliver(envelope: Envelope): void {
    for (const handler of this.handlers) {
      handler(envelope);
    }
  }
}

describe("runCodexAdapter", () => {
  let dataDir: string;

  beforeEach(() => {
    process.env.TALKIE_CODEX_JOIN_SLUG = "demo";
    dataDir = mkdtempSync(join(tmpdir(), "talkie-codex-adapter-"));
    process.env.AGENT_TALKIE_DATA_DIR = dataDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.TALKIE_CODEX_JOIN_SLUG;
    delete process.env.TALKIE_CODEX_SPACE_ID;
    delete process.env.TALKIE_CODEX_ARGS_JSON;
    delete process.env.TALKIE_CODEX_DISPLAY_NAME;
    delete process.env.TALKIE_CODEX_RUNTIME;
    delete process.env.TALKIE_CODEX_WORKSPACE_LABEL;
    delete process.env.AGENT_TALKIE_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("runs codex exec for the first inbound message and relays the final agent reply", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    const children: MockChild[] = [];
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }
    const abortController = new AbortController();
    const mockSpawn = vi.fn((cmd: string, args: string[]) => {
      const child = createMockChild();
      children.push(child);
      return child;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
      signal: abortController.signal,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID,
      payload: { text: "summarize the diff" },
    });

    await waitFor(() => children.length === 1);
    expect(mockSpawn).toHaveBeenCalledWith(
      "codex",
      ["exec", "--json", "summarize the diff"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    );

    writeJsonLines(children[0]!.stdout, [
      { type: "thread.started", thread_id: THREAD_ID },
      {
        type: "item.completed",
        item: {
          type: "agent_message",
          content: [{ type: "text", text: "Diff summary from Codex" }],
        },
      },
      { type: "turn.completed" },
    ]);
    finishChild(children[0]!, 0);
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length > 0);

    expect(createdClient!.sendEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: REG_SID,
        kind: "conversation",
        type: "chat.message",
        spaceId: SPACE_SID,
        payload: { text: "Diff summary from Codex" },
      }),
    );
    expect(
      JSON.parse(
        readFileSync(join(dataDir, CODEX_THREAD_STATE_FILE), "utf8"),
      ) as { spaces: Record<string, { threadId: string }> },
    ).toEqual({
      spaces: {
        [SPACE_SID]: { threadId: THREAD_ID },
      },
    });

    abortController.abort();
    await run;
  });

  it("runs codex exec for direct messages addressed to the adapter", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    const children: MockChild[] = [];
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }
    const abortController = new AbortController();
    const mockSpawn = vi.fn((cmd: string, args: string[]) => {
      const child = createMockChild();
      children.push(child);
      return child;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
      signal: abortController.signal,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.direct",
      spaceId: SPACE_SID,
      to: REG_SID,
      payload: { text: "private instruction for codex" },
    });

    await waitFor(() => children.length === 1);
    expect(mockSpawn).toHaveBeenCalledWith(
      "codex",
      ["exec", "--json", "private instruction for codex"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    );

    writeJsonLines(children[0]!.stdout, [
      { type: "thread.started", thread_id: THREAD_ID },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "Private reply from Codex" },
      },
      { type: "turn.completed" },
    ]);
    finishChild(children[0]!, 0);
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length > 0);

    expect(createdClient!.sendEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: REG_SID,
        kind: "conversation",
        type: "chat.direct",
        spaceId: SPACE_SID,
        to: HUMAN_SID,
        payload: { text: "Private reply from Codex" },
      }),
    );

    abortController.abort();
    await run;
  });

  it("signals readiness after the session is joined and inbound messages are subscribed", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }
    const abortController = new AbortController();
    let readySessionId: string | undefined;
    const ready = new Promise<void>((resolve) => {
      const run = runCodexAdapter({
        spawn: vi.fn(createMockChild) as unknown as typeof import("node:child_process").spawn,
        ensureRelay: async () => ({ port: 18765 }),
        TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
        signal: abortController.signal,
        onReady: ({ sessionId }) => {
          readySessionId = sessionId;
          resolve();
        },
      });
      void run.finally(() => {});
    });

    await ready;
    expect(readySessionId).toBe(REG_SID);
    expect(createdClient!.joinSpace).toHaveBeenCalledWith({
      slug: "demo",
      idempotencyKey: expect.any(String),
    });
    expect(createdClient!.onEnvelope).toHaveBeenCalled();

    abortController.abort();
  });

  it("resumes both the Talkie session and the Codex thread on later turns", async () => {
    process.env.TALKIE_CODEX_ARGS_JSON =
      '["--sandbox","read-only","--model","gpt-5.2"]';
    let createdClient: MockTalkieSessionClient | null = null;
    const children: MockChild[] = [];
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }

    writePersistedSessionState(dataDir);
    writeFileSync(
      join(dataDir, CODEX_THREAD_STATE_FILE),
      JSON.stringify({
        spaces: {
          [SPACE_SID]: { threadId: THREAD_ID },
        },
      }),
      "utf8",
    );

    const abortController = new AbortController();
    const mockSpawn = vi.fn((cmd: string, args: string[]) => {
      const child = createMockChild();
      children.push(child);
      return child;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
      signal: abortController.signal,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(createdClient!.resume).toHaveBeenCalledWith({
      sessionId: REG_SID,
      reconnectSecret: "stored-secret",
    });
    expect(createdClient!.registerSession).not.toHaveBeenCalled();

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID,
      payload: { text: "continue the same thread" },
    });

    await waitFor(() => children.length === 1);
    expect(mockSpawn).toHaveBeenCalledWith(
      "codex",
      [
        "exec",
        "--json",
        "--sandbox",
        "read-only",
        "--model",
        "gpt-5.2",
        "resume",
        THREAD_ID,
        "continue the same thread",
      ],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    );

    writeJsonLines(children[0]!.stdout, [
      { type: "thread.started", thread_id: THREAD_ID },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "Resumed reply" },
      },
      { type: "turn.completed" },
    ]);
    finishChild(children[0]!, 0);
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length > 0);

    expect(
      JSON.parse(
        readFileSync(join(dataDir, CODEX_SESSION_STATE_FILE), "utf8"),
      ) as { sessionId: string; reconnectSecret: string; identity: unknown },
    ).toEqual({
      sessionId: REG_SID,
      reconnectSecret: "r2",
      identity: DEFAULT_CODEX_SESSION_IDENTITY,
    });
    expect(createdClient!.sendEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "conversation",
        spaceId: SPACE_SID,
        payload: { text: "Resumed reply" },
      }),
    );

    abortController.abort();
    await run;
  });

  it("registers a fresh session when the resumed session is in another space", async () => {
    const clients: MockTalkieSessionClient[] = [];
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        clients.push(this);
        if (clients.length === 1) {
          this.joinSpace = vi.fn(async () => {
            throw new Error('{"error":"already_in_space"}');
          });
        }
      }
    }

    writePersistedSessionState(dataDir);

    const abortController = new AbortController();
    let readySessionId: string | undefined;
    const ready = new Promise<void>((resolve) => {
      const run = runCodexAdapter({
        spawn: vi.fn(createMockChild) as unknown as typeof import("node:child_process").spawn,
        ensureRelay: async () => ({ port: 18765 }),
        TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
        signal: abortController.signal,
        onReady: ({ sessionId }) => {
          readySessionId = sessionId;
          resolve();
        },
      });
      void run.finally(() => {});
    });

    await ready;

    expect(clients).toHaveLength(2);
    expect(clients[0]!.resume).toHaveBeenCalledWith({
      sessionId: REG_SID,
      reconnectSecret: "stored-secret",
    });
    expect(clients[0]!.close).toHaveBeenCalledOnce();
    expect(clients[1]!.registerSession).toHaveBeenCalledOnce();
    expect(clients[1]!.joinSpace).toHaveBeenCalledWith({
      slug: "demo",
      idempotencyKey: expect.any(String),
    });
    expect(readySessionId).toBe(REG_SID);

    abortController.abort();
  });

  it("registers a fresh session when the persisted session identity does not match the current adapter identity", async () => {
    process.env.TALKIE_CODEX_DISPLAY_NAME = "codex-cli-real";
    process.env.TALKIE_CODEX_RUNTIME = "codex-cli";
    process.env.TALKIE_CODEX_WORKSPACE_LABEL = "agent-talkie";

    let createdClient: MockTalkieSessionClient | null = null;
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }

    writePersistedSessionState(dataDir, {
      identity: {
        ...DEFAULT_CODEX_SESSION_IDENTITY,
        displayName: "old-codex",
      },
    });

    const abortController = new AbortController();
    const run = runCodexAdapter({
      spawn: vi.fn(createMockChild) as unknown as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
      signal: abortController.signal,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(createdClient!.resume).not.toHaveBeenCalled();
    expect(createdClient!.registerSession).toHaveBeenCalledWith({
      displayName: "codex-cli-real",
      runtime: "codex-cli",
      workspaceLabel: "agent-talkie",
      isHuman: false,
    });
    expect(
      JSON.parse(
        readFileSync(join(dataDir, CODEX_SESSION_STATE_FILE), "utf8"),
      ) as { identity: unknown },
    ).toEqual(
      expect.objectContaining({
        identity: {
          displayName: "codex-cli-real",
          runtime: "codex-cli",
          workspaceLabel: "agent-talkie",
          isHuman: false,
        },
      }),
    );

    abortController.abort();
    await run;
  });

  it("reports blocked stderr lines via metadata.patch while a turn is running", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    const children: MockChild[] = [];
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }

    const abortController = new AbortController();
    const mockSpawn = vi.fn((cmd: string, args: string[]) => {
      const child = createMockChild();
      children.push(child);
      return child;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
      signal: abortController.signal,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID,
      payload: { text: "run tests" },
    });

    await waitFor(() => children.length === 1);
    children[0]!.stderr.write(
      "needs your approval to run\nneeds your approval to run\n",
    );
    writeJsonLines(children[0]!.stdout, [
      { type: "thread.started", thread_id: THREAD_ID },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "Waiting finished" },
      },
      { type: "turn.completed" },
    ]);
    finishChild(children[0]!, 0);
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length >= 2);

    const blockedCalls = createdClient!.sendEnvelope.mock.calls.filter(
      (call) => (call[0] as Envelope).type === "metadata.patch",
    );
    expect(blockedCalls).toHaveLength(1);
    expect(blockedCalls[0]![0]).toMatchObject({
      sessionId: REG_SID,
      kind: "control",
      type: "metadata.patch",
      spaceId: SPACE_SID,
      payload: {
        namespace: "status",
        patch: {
          progress: "blocked",
          blockedReason: "needs your approval to run",
        },
      },
    });

    abortController.abort();
    await run;
  });

  it("does not report internal Codex goal-store warnings as blocked user-visible status", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    const children: MockChild[] = [];
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }

    const abortController = new AbortController();
    const mockSpawn = vi.fn((cmd: string, args: string[]) => {
      const child = createMockChild();
      children.push(child);
      return child;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
      signal: abortController.signal,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID,
      payload: { text: "answer exactly" },
    });

    await waitFor(() => children.length === 1);
    children[0]!.stderr.write(
      "2026-05-30T14:58:36Z  WARN codex_core::goals: failed to pause active thread goal after interrupt: error returned from database: (code: 1) no such table: thread_goals\n",
    );
    writeJsonLines(children[0]!.stdout, [
      { type: "thread.started", thread_id: THREAD_ID },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "Exact answer" },
      },
      { type: "turn.completed" },
    ]);
    finishChild(children[0]!, 0);
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length === 1);

    expect(createdClient!.sendEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "conversation",
        payload: { text: "Exact answer" },
      }),
    );

    abortController.abort();
    await run;
  });

  it("keeps thread ids isolated per Talkie space across turns", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    const children: MockChild[] = [];
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }

    const abortController = new AbortController();
    const mockSpawn = vi.fn((cmd: string, args: string[]) => {
      const child = createMockChild();
      children.push(child);
      return child;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
      signal: abortController.signal,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID,
      payload: { text: "first space turn" },
    });

    await waitFor(() => children.length === 1);
    writeJsonLines(children[0]!.stdout, [
      { type: "thread.started", thread_id: THREAD_ID },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "reply one" },
      },
      { type: "turn.completed" },
    ]);
    finishChild(children[0]!, 0);
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length === 1);

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID_2,
      payload: { text: "second space turn" },
    });

    await waitFor(() => children.length === 2);
    expect(mockSpawn).toHaveBeenNthCalledWith(
      2,
      "codex",
      ["exec", "--json", "second space turn"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    );

    writeJsonLines(children[1]!.stdout, [
      { type: "thread.started", thread_id: THREAD_ID_2 },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "reply two" },
      },
      { type: "turn.completed" },
    ]);
    finishChild(children[1]!, 0);
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length === 2);

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID,
      payload: { text: "resume first space only" },
    });

    await waitFor(() => children.length === 3);
    expect(mockSpawn).toHaveBeenNthCalledWith(
      3,
      "codex",
      ["exec", "--json", "resume", THREAD_ID, "resume first space only"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
    );
    writeJsonLines(children[2]!.stdout, [
      { type: "thread.started", thread_id: THREAD_ID },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "reply three" },
      },
      { type: "turn.completed" },
    ]);
    finishChild(children[2]!, 0);
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length === 3);

    expect(
      JSON.parse(
        readFileSync(join(dataDir, CODEX_THREAD_STATE_FILE), "utf8"),
      ) as { spaces: Record<string, { threadId: string }> },
    ).toEqual({
      spaces: {
        [SPACE_SID]: { threadId: THREAD_ID },
        [SPACE_SID_2]: { threadId: THREAD_ID_2 },
      },
    });

    abortController.abort();
    await run;
  });

  it("dedupes JSONL agent events and emits only the final assistant reply once", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    const children: MockChild[] = [];
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }

    const abortController = new AbortController();
    const mockSpawn = vi.fn((cmd: string, args: string[]) => {
      const child = createMockChild();
      children.push(child);
      return child;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
      signal: abortController.signal,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID,
      payload: { text: "produce one final answer" },
    });

    await waitFor(() => children.length === 1);
    children[0]!.stdout.write("{not valid json}\n");
    writeJsonLines(children[0]!.stdout, [
      { type: "thread.started", thread_id: THREAD_ID },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "draft answer" },
      },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "draft answer" },
      },
      {
        type: "item.completed",
        item: {
          type: "agent_message",
          content: [
            { type: "text", text: "final" },
            { type: "text", text: " answer" },
          ],
        },
      },
      { type: "turn.completed" },
    ]);
    finishChild(children[0]!, 0);
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length === 1);

    expect(createdClient!.sendEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "conversation",
        type: "chat.message",
        spaceId: SPACE_SID,
        payload: { text: "final answer" },
      }),
    );

    abortController.abort();
    await run;
  });

  it("does not start an overlapping Codex run for the same space", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    const children: MockChild[] = [];
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }

    const abortController = new AbortController();
    const mockSpawn = vi.fn((cmd: string, args: string[]) => {
      const child = createMockChild();
      children.push(child);
      return child;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
      signal: abortController.signal,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID,
      payload: { text: "first turn" },
    });
    await waitFor(() => children.length === 1);

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID,
      payload: { text: "second turn too early" },
    });
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length === 1);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(createdClient!.sendEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "control",
        type: "metadata.patch",
        spaceId: SPACE_SID,
        payload: {
          namespace: "status",
          patch: {
            progress: "blocked",
            blockedReason: expect.stringContaining("already running"),
          },
        },
      }),
    );

    writeJsonLines(children[0]!.stdout, [
      { type: "thread.started", thread_id: THREAD_ID },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "finished first turn" },
      },
      { type: "turn.completed" },
    ]);
    finishChild(children[0]!, 0);
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length === 2);

    abortController.abort();
    await run;
  });

  it("reports Codex JSONL error events via metadata.patch", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    const children: MockChild[] = [];
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }

    const abortController = new AbortController();
    const mockSpawn = vi.fn((cmd: string, args: string[]) => {
      const child = createMockChild();
      children.push(child);
      return child;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
      signal: abortController.signal,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID,
      payload: { text: "requires auth" },
    });

    await waitFor(() => children.length === 1);
    writeJsonLines(children[0]!.stdout, [
      { type: "error", message: "missing authentication" },
    ]);
    finishChild(children[0]!, 1);
    await waitFor(() => createdClient!.sendEnvelope.mock.calls.length === 1);

    expect(createdClient!.sendEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: REG_SID,
        kind: "control",
        type: "metadata.patch",
        spaceId: SPACE_SID,
        payload: {
          namespace: "status",
          patch: {
            progress: "blocked",
            blockedReason: "Codex error: missing authentication",
          },
        },
      }),
    );

    abortController.abort();
    await run;
  });

  it("does not label every nonzero Codex exit as blocked", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    const children: MockChild[] = [];
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }

    const abortController = new AbortController();
    const mockSpawn = vi.fn((cmd: string, args: string[]) => {
      const child = createMockChild();
      children.push(child);
      return child;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
      signal: abortController.signal,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    createdClient!.deliver({
      version: 1,
      id: uuidv4(),
      sessionId: HUMAN_SID,
      kind: "conversation",
      type: "chat.message",
      spaceId: SPACE_SID,
      payload: { text: "this will fail" },
    });

    await waitFor(() => children.length === 1);
    children[0]!.stderr.write("codex failed to complete the turn\n");
    finishChild(children[0]!, 2);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(createdClient!.sendEnvelope).not.toHaveBeenCalled();

    abortController.abort();
    await run;
  });
});
