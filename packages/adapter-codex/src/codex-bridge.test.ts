import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import type { TalkieSessionClient } from "@agent-talkie/client";
import {
  safeParseEnvelope,
  type Envelope,
} from "@agent-talkie/protocol";
import { runCodexAdapter } from "./codex-bridge.js";

const REG_SID = uuidv7();
const SPACE_SID = uuidv7();

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function createMockChild(): ChildProcess {
  const emitter = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
  };
  emitter.stdin = new PassThrough();
  emitter.stdout = new PassThrough();
  emitter.stderr = new PassThrough();
  return emitter as unknown as ChildProcess;
}

function writeContentLengthFrame(stream: PassThrough, obj: unknown): void {
  const b = Buffer.from(JSON.stringify(obj), "utf8");
  stream.write(`Content-Length: ${b.length}\r\n\r\n`);
  stream.write(b);
}

function parseFirstJsonFrame(buf: Buffer): unknown {
  const sep = buf.indexOf("\r\n\r\n");
  if (sep === -1) {
    throw new Error("no header terminator in stdin capture");
  }
  const headerText = buf.subarray(0, sep).toString("utf8");
  const m = /^Content-Length:\s*(\d+)\s*$/im.exec(headerText);
  if (!m) {
    throw new Error(`bad Content-Length header: ${headerText}`);
  }
  const len = Number.parseInt(m[1], 10);
  const bodyStart = sep + 4;
  const body = buf.subarray(bodyStart, bodyStart + len);
  return JSON.parse(body.toString("utf8")) as unknown;
}

class MockTalkieSessionClient {
  readonly handlers = new Set<(e: Envelope) => void>();
  connect = vi.fn(async () => {});
  registerSession = vi.fn(async () => ({
    sessionId: REG_SID,
    reconnectSecret: "r",
    displayName: "d",
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
  onEnvelope = vi.fn((h: (e: Envelope) => void) => {
    this.handlers.add(h);
  });
  close = vi.fn();
  constructor(_opts?: { url?: string }) {
    void _opts;
  }
  deliver(env: Envelope): void {
    for (const h of this.handlers) {
      h(env);
    }
  }
}

describe("runCodexAdapter", () => {
  let mockChild: ChildProcess;
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
    delete process.env.AGENT_TALKIE_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("calls sendEnvelope with child stdout envelope (instance spy)", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }
    const mockSpawn = vi.fn((): ChildProcess => {
      mockChild = createMockChild();
      return mockChild;
    });
    const outEnv: Envelope = {
      version: 1,
      id: uuidv4(),
      sessionId: uuidv7(),
      kind: "control",
      type: "task.assign",
      payload: { summary: "do work" },
    };

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    writeContentLengthFrame(mockChild.stdout as PassThrough, outEnv);
    (mockChild.stdout as PassThrough).end();
    (mockChild.stderr as PassThrough).end();
    mockChild.emit("exit", 0, null);

    await run;

    expect(createdClient).not.toBeNull();
    expect(createdClient!.sendEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: outEnv.kind,
        type: outEnv.type,
        sessionId: outEnv.sessionId,
      }),
    );
  });

  it("writes Content-Length framed stdin for inbound conversation envelope (round-trip)", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }
    const mockSpawn = vi.fn((): ChildProcess => {
      mockChild = createMockChild();
      return mockChild;
    });
    const chunks: Buffer[] = [];
    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    (mockChild.stdin as PassThrough).on("data", (c: Buffer | string) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    });

    const inbound: Envelope = {
      version: 1,
      id: uuidv4(),
      sessionId: uuidv7(),
      kind: "conversation",
      type: "chat.message",
      payload: { text: "hi" },
      to: REG_SID,
    };
    expect(safeParseEnvelope(inbound).success).toBe(true);
    createdClient!.deliver(inbound);

    await flushMicrotasks();
    await flushMicrotasks();

    (mockChild.stdout as PassThrough).end();
    (mockChild.stderr as PassThrough).end();
    mockChild.emit("exit", 0, null);

    await run;

    const stdinBuf = Buffer.concat(chunks);
    const parsed = parseFirstJsonFrame(stdinBuf) as Record<string, unknown>;
    expect(parsed.kind).toBe("conversation");
    expect(parsed.type).toBe("chat.message");
    expect(parsed.payload).toEqual({ text: "hi" });
  });

  it("sends metadata.patch blocked once for stderr line needs your approval to run", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }
    const mockSpawn = vi.fn((): ChildProcess => {
      mockChild = createMockChild();
      return mockChild;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    (mockChild.stderr as PassThrough).write("needs your approval to run\n");
    (mockChild.stdout as PassThrough).end();
    (mockChild.stderr as PassThrough).end();
    mockChild.emit("exit", 0, null);

    await run;

    const blockedCalls = createdClient!.sendEnvelope.mock.calls.filter(
      (call) =>
        (call[0] as Envelope).type === "metadata.patch" &&
        (call[0] as Envelope).kind === "control",
    );
    expect(blockedCalls).toHaveLength(1);
    const env = blockedCalls[0]![0] as Envelope;
    expect(env.payload).toMatchObject({
      namespace: "status",
      patch: {
        progress: "blocked",
        blockedReason: "needs your approval to run",
      },
    });
    expect(env.spaceId).toBe(SPACE_SID);
  });

  it("does not send second metadata.patch within cooldown for same stderr pattern", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }
    const mockSpawn = vi.fn((): ChildProcess => {
      mockChild = createMockChild();
      return mockChild;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    (mockChild.stderr as PassThrough).write(
      "needs your approval to run\nneeds your approval to run\n",
    );
    (mockChild.stdout as PassThrough).end();
    (mockChild.stderr as PassThrough).end();
    mockChild.emit("exit", 0, null);

    await run;

    const blockedCalls = createdClient!.sendEnvelope.mock.calls.filter(
      (call) => (call[0] as Envelope).type === "metadata.patch",
    );
    expect(blockedCalls).toHaveLength(1);
  });

  it("resumes from persisted session credentials and rotates the stored secret", async () => {
    let createdClient: MockTalkieSessionClient | null = null;
    class TrackedMock extends MockTalkieSessionClient {
      constructor(opts?: { url?: string }) {
        super(opts);
        createdClient = this;
      }
    }
    const statePath = join(dataDir, "adapter-codex-session-state.json");
    writeFileSync(
      statePath,
      JSON.stringify({
        sessionId: REG_SID,
        reconnectSecret: "stored-secret",
      }),
      "utf8",
    );

    const mockSpawn = vi.fn((): ChildProcess => {
      mockChild = createMockChild();
      return mockChild;
    });

    const run = runCodexAdapter({
      spawn: mockSpawn as typeof import("node:child_process").spawn,
      ensureRelay: async () => ({ port: 18765 }),
      TalkieSessionClient: TrackedMock as unknown as typeof TalkieSessionClient,
    });
    await flushMicrotasks();
    await flushMicrotasks();

    (mockChild.stdout as PassThrough).end();
    (mockChild.stderr as PassThrough).end();
    mockChild.emit("exit", 0, null);
    await run;

    expect(createdClient).not.toBeNull();
    expect(createdClient!.resume).toHaveBeenCalledWith({
      sessionId: REG_SID,
      reconnectSecret: "stored-secret",
    });
    expect(createdClient!.registerSession).not.toHaveBeenCalled();
    expect(
      JSON.parse(readFileSync(statePath, "utf8")) as {
        sessionId: string;
        reconnectSecret: string;
      },
    ).toEqual({
      sessionId: REG_SID,
      reconnectSecret: "r2",
    });
  });
});
