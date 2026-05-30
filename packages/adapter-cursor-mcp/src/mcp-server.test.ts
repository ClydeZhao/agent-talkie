import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  appendTranscriptEntry,
  createSession,
  insertMembership,
  insertSpaceWithSlug,
  migrate,
  openDatabase,
  setOrchestratorSessionId,
} from "@agent-talkie/persistence";
import type { Envelope } from "@agent-talkie/protocol";
import { createMcpServer } from "./mcp-server.js";

type MockClient = {
  connect: ReturnType<typeof vi.fn>;
  registerSession: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  joinSpace: ReturnType<typeof vi.fn>;
  sendEnvelope: ReturnType<typeof vi.fn>;
  onEnvelope: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

function stateForAttachment(args?: {
  slug?: string;
  spaceId?: string;
  sessionId?: string;
  reconnectSecret?: string;
  displayName?: string;
  runtime?: string;
}): string {
  const slug = args?.slug ?? "demo";
  return JSON.stringify({
    attachments: {
      [slug]: {
        sessionId: args?.sessionId ?? "11111111-1111-4111-8111-111111111111",
        reconnectSecret: args?.reconnectSecret ?? "stored-secret",
        slug,
        spaceId: args?.spaceId ?? "22222222-2222-4222-8222-222222222222",
        displayName: args?.displayName ?? "cursor",
        runtime: args?.runtime ?? "adapter-cursor-mcp",
        workspaceLabel: ".",
      },
    },
  });
}

function makeClient(args?: {
  sessionId?: string;
  reconnectSecret?: string;
  displayName?: string;
  spaceId?: string;
  slug?: string;
  joinSpace?: MockClient["joinSpace"];
  resume?: MockClient["resume"];
}): MockClient {
  const sessionId = args?.sessionId ?? "11111111-1111-4111-8111-111111111111";
  const reconnectSecret = args?.reconnectSecret ?? "new-secret";
  const displayName = args?.displayName ?? "cursor";
  const spaceId = args?.spaceId ?? "22222222-2222-4222-8222-222222222222";
  const slug = args?.slug ?? "demo";
  return {
    connect: vi.fn(async () => {}),
    registerSession: vi.fn(async () => ({
      sessionId,
      reconnectSecret,
      displayName,
    })),
    resume:
      args?.resume ??
      vi.fn(async () => {
        throw new Error("no persisted session");
      }),
    joinSpace:
      args?.joinSpace ??
      vi.fn(async () => ({
        spaceId,
        slug,
      })),
    sendEnvelope: vi.fn(),
    onEnvelope: vi.fn(),
    close: vi.fn(),
  };
}

describe("createMcpServer", () => {
  const registeredToolNames: string[] = [];
  const toolHandlers = new Map<
    string,
    Parameters<McpServer["registerTool"]>[2]
  >();
  const resourceHandlers = new Map<
    string,
    Parameters<McpServer["registerResource"]>[3]
  >();
  let originalRegisterTool: McpServer["registerTool"];
  let originalRegisterResource: McpServer["registerResource"];
  let dataDir: string;

  beforeEach(() => {
    registeredToolNames.length = 0;
    toolHandlers.clear();
    resourceHandlers.clear();
    dataDir = mkdtempSync(join(tmpdir(), "talkie-cursor-mcp-"));
    process.env.AGENT_TALKIE_DATA_DIR = dataDir;
    originalRegisterTool = McpServer.prototype.registerTool;
    originalRegisterResource = McpServer.prototype.registerResource;
    vi.spyOn(McpServer.prototype, "registerTool").mockImplementation(function (
      this: McpServer,
      name: string,
      config: Parameters<McpServer["registerTool"]>[1],
      cb: Parameters<McpServer["registerTool"]>[2],
    ) {
      registeredToolNames.push(name);
      toolHandlers.set(name, cb);
      return originalRegisterTool.call(this, name, config, cb);
    });
    vi.spyOn(McpServer.prototype, "registerResource").mockImplementation(function (
      this: McpServer,
      name: string,
      uriOrTemplate: Parameters<McpServer["registerResource"]>[1],
      config: Parameters<McpServer["registerResource"]>[2],
      cb: Parameters<McpServer["registerResource"]>[3],
    ) {
      resourceHandlers.set(name, cb);
      return originalRegisterResource.call(
        this,
        name,
        uriOrTemplate as never,
        config,
        cb as never,
      );
    });
  });

  afterEach(() => {
    delete process.env.AGENT_TALKIE_DATA_DIR;
    delete process.env.TALKIE_MCP_JOIN_SLUG;
    delete process.env.TALKIE_MCP_DISPLAY_NAME;
    delete process.env.TALKIE_MCP_RUNTIME;
    delete process.env.TALKIE_MCP_STATE_NAMESPACE;
    delete process.env.TALKIE_MCP_IS_HUMAN;
    rmSync(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("registers product flow tools and existing collaboration tools", () => {
    createMcpServer({
      client: makeClient() as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });
    expect(registeredToolNames).toContain("create_space");
    expect(registeredToolNames).toContain("list_active_spaces");
    expect(registeredToolNames).toContain("join_from_prompt");
    expect(registeredToolNames).toContain("join_space");
    expect(registeredToolNames).toContain("send_message");
    expect(registeredToolNames).toContain("assign_orchestrator");
    expect(registeredToolNames).toContain("update_metadata");
    expect(registeredToolNames).toContain("pull_inbox");
  });

  it("does not auto-join from TALKIE_MCP_JOIN_SLUG", async () => {
    process.env.TALKIE_MCP_JOIN_SLUG = "demo";
    const client = makeClient();
    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const pullInbox = toolHandlers.get("pull_inbox");
    expect(pullInbox).toBeDefined();
    const result = await pullInbox!({}, {} as never);

    expect(result.content[0]?.text).toContain("\"count\":0");
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.joinSpace).not.toHaveBeenCalled();
  });

  it("create_space creates an unnamed product space as orchestrator and emits a join prompt", async () => {
    const client = makeClient({
      joinSpace: vi.fn(async (args: { slug: string }) => ({
        spaceId: "22222222-2222-4222-8222-222222222222",
        slug: args.slug,
      })),
    });
    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const createSpace = toolHandlers.get("create_space");
    expect(createSpace).toBeDefined();
    const result = await createSpace!(
      { name: "cursor-lead", workspaceLabel: "repo" },
      {} as never,
    );

    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      ok: boolean;
      slug: string;
      label: string;
      spaceId: string;
      sessionId: string;
      displayName: string;
      dashboardUrl: string;
      joinPrompt: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.slug).toMatch(/^talkie-[a-z0-9]+-[a-f0-9-]+$/);
    expect(payload.label).toMatch(/^Talkie Space \d{4}-\d{2}-\d{2} /);
    expect(payload.label).not.toContain(payload.slug);
    expect(payload.spaceId).toBe("22222222-2222-4222-8222-222222222222");
    expect(payload.sessionId).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload.displayName).toBe("cursor");
    expect(payload.dashboardUrl).toBe(
      `http://127.0.0.1:18765/dashboard?space=${payload.slug}`,
    );
    expect(payload.joinPrompt).toContain(`Space label: ${payload.label}`);
    expect(payload.joinPrompt).toContain(`Space slug: ${payload.slug}`);
    expect(payload.joinPrompt).toContain("Do not ask the human to run low-level");
    expect(client.registerSession).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "cursor-lead",
        runtime: "adapter-cursor-mcp",
        workspaceLabel: "repo",
        isHuman: true,
      }),
    );
    expect(client.joinSpace).toHaveBeenCalledWith({
      slug: payload.slug,
      label: payload.label,
      idempotencyKey: expect.any(String),
      creatorOrchestrator: true,
    });
  });

  it("list_active_spaces exposes product labels and hides archived spaces", async () => {
    const dbPath = join(dataDir, "relay.sqlite");
    const db = openDatabase(dbPath);
    migrate(db);
    const now = Date.now();
    const { id: alphaId } = insertSpaceWithSlug(db, {
      slug: "alpha-room",
      label: "Alpha Room",
      nowMs: now,
    });
    const { id: archivedId } = insertSpaceWithSlug(db, {
      slug: "archived-room",
      label: "Archived Room",
      nowMs: now,
    });
    const { id: memberId } = createSession(db, {
      displayName: "codex-lead",
      runtime: "codex-cli",
      workspaceLabel: "repo",
      isHuman: false,
    });
    insertMembership(db, { spaceId: alphaId, sessionId: memberId, nowMs: now });
    db.prepare(`UPDATE spaces SET status = 'archived' WHERE id = ?`).run(
      archivedId,
    );
    db.close();

    createMcpServer({
      dbPath,
      client: makeClient() as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const result = await toolHandlers.get("list_active_spaces")!({}, {} as never);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      ok: boolean;
      spaces: Array<{ slug: string; label: string; status: string; memberCount: number }>;
    };

    expect(payload).toMatchObject({ ok: true });
    expect(payload.spaces).toContainEqual(
      expect.objectContaining({
        slug: "alpha-room",
        label: "Alpha Room",
        status: "active",
        memberCount: 1,
      }),
    );
    expect(payload.spaces).not.toContainEqual(
      expect.objectContaining({ slug: "archived-room" }),
    );
  });

  it("join_from_prompt parses a pasted dashboard prompt and joins that space", async () => {
    const dbPath = join(dataDir, "relay.sqlite");
    const db = openDatabase(dbPath);
    migrate(db);
    insertSpaceWithSlug(db, {
      slug: "alpha-room",
      label: "Alpha Room",
      nowMs: Date.now(),
    });
    db.close();

    const client = makeClient({
      joinSpace: vi.fn(async (args: { slug: string }) => ({
        spaceId: "22222222-2222-4222-8222-222222222222",
        slug: args.slug,
      })),
    });
    createMcpServer({
      dbPath,
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const result = await toolHandlers.get("join_from_prompt")!(
      {
        prompt: [
          "Join this local Agent Talkie Space.",
          "Space label: Alpha Room",
          "Space slug: alpha-room",
        ].join("\n"),
        name: "cursor-worker",
      },
      {} as never,
    );

    expect(client.registerSession).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "cursor-worker" }),
    );
    expect(client.joinSpace).toHaveBeenCalledWith({
      slug: "alpha-room",
      idempotencyKey: expect.any(String),
    });
    expect(result.content[0]?.text).toContain("\"ok\":true");
    expect(result.content[0]?.text).toContain("\"slug\":\"alpha-room\"");
  });

  it("join_from_prompt returns a validation error when no space slug is present", async () => {
    const client = makeClient();
    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const result = await toolHandlers.get("join_from_prompt")!(
      { prompt: "please join the space", name: "cursor-worker" },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "Could not find a Talkie space slug in the join prompt.",
    );
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.joinSpace).not.toHaveBeenCalled();
  });

  it("join_from_prompt rejects stale prompts instead of creating a new space", async () => {
    const client = makeClient();
    createMcpServer({
      dbPath: join(dataDir, "relay.sqlite"),
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const result = await toolHandlers.get("join_from_prompt")!(
      {
        prompt: [
          "Join this local Agent Talkie Space.",
          "Space label: Missing",
          "Space slug: missing-room",
        ].join("\n"),
        name: "cursor-worker",
      },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "Join prompt references a space that is not active locally: missing-room",
    );
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.joinSpace).not.toHaveBeenCalled();
  });

  it("explicit join_space registers and joins a space-scoped attachment", async () => {
    const client = makeClient();
    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const joinSpace = toolHandlers.get("join_space");
    expect(joinSpace).toBeDefined();
    const result = await joinSpace!(
      { slug: "demo", name: "cursor-demo" },
      {} as never,
    );

    expect(client.registerSession).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "cursor-demo" }),
    );
    expect(client.joinSpace).toHaveBeenCalledWith({
      slug: "demo",
      idempotencyKey: expect.any(String),
    });
    expect(result.content[0]?.text).toContain("\"ok\":true");
    expect(result.content[0]?.text).toContain("\"displayName\":\"cursor\"");
    expect(
      statSync(join(dataDir, "adapter-cursor-mcp-session-state.json")).mode &
        0o777,
    ).toBe(0o600);
  });

  it("resumes persisted attachment credentials before explicit join_space", async () => {
    writeFileSync(
      join(dataDir, "adapter-cursor-mcp-session-state.json"),
      stateForAttachment(),
      "utf8",
    );
    const client = makeClient({
      resume: vi.fn(async () => ({
        sessionId: "11111111-1111-4111-8111-111111111111",
        reconnectSecret: "rotated-secret",
      })),
    });

    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const joinSpace = toolHandlers.get("join_space");
    expect(joinSpace).toBeDefined();
    await joinSpace!({ slug: "demo" }, {} as never);

    expect(client.resume).toHaveBeenCalledWith({
      sessionId: "11111111-1111-4111-8111-111111111111",
      reconnectSecret: "stored-secret",
    });
    expect(client.registerSession).not.toHaveBeenCalled();
    expect(client.joinSpace).toHaveBeenCalled();
  });

  it("send_message by slug requires an explicit prior join", async () => {
    const client = makeClient();
    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const sendMessage = toolHandlers.get("send_message");
    expect(sendMessage).toBeDefined();
    const result = await sendMessage!(
      { slug: "demo", text: "hello" },
      {} as never,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(
      "current MCP-backed runtime session has not joined space demo",
    );
    expect(client.joinSpace).not.toHaveBeenCalled();
    expect(client.sendEnvelope).not.toHaveBeenCalled();
  });

  it("send_message uses the joined slug attachment", async () => {
    const client = makeClient();
    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    await toolHandlers.get("join_space")!({ slug: "demo" }, {} as never);
    const result = await toolHandlers.get("send_message")!(
      { slug: "demo", text: "hello" },
      {} as never,
    );

    expect(client.joinSpace).toHaveBeenCalledTimes(1);
    expect(client.sendEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "11111111-1111-4111-8111-111111111111",
        kind: "conversation",
        type: "chat.message",
        spaceId: "22222222-2222-4222-8222-222222222222",
        payload: { text: "hello" },
      }),
    );
    expect(result.content[0]?.text).toContain("\"ok\":true");
  });

  it("send_message uses chat.direct when targeting a specific session", async () => {
    const client = makeClient();
    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    await toolHandlers.get("join_space")!({ slug: "demo" }, {} as never);
    const result = await toolHandlers.get("send_message")!(
      {
        slug: "demo",
        text: "private hello",
        toSessionId: "33333333-3333-4333-8333-333333333333",
      },
      {} as never,
    );

    expect(client.sendEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "conversation",
        type: "chat.direct",
        spaceId: "22222222-2222-4222-8222-222222222222",
        to: "33333333-3333-4333-8333-333333333333",
        payload: { text: "private hello" },
      }),
    );
    expect(result.content[0]?.text).toContain("\"ok\":true");
  });

  it("normalizes slug input consistently across join and send", async () => {
    const client = makeClient({ slug: "demo-room" });
    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    await toolHandlers.get("join_space")!({ slug: "Demo Room" }, {} as never);
    const result = await toolHandlers.get("send_message")!(
      { slug: "demo-room", text: "hello" },
      {} as never,
    );

    expect(client.joinSpace).toHaveBeenCalledWith({
      slug: "demo-room",
      idempotencyKey: expect.any(String),
    });
    expect(client.sendEnvelope).toHaveBeenCalledOnce();
    expect(result.content[0]?.text).toContain("\"slug\":\"demo-room\"");
  });

  it("can join two spaces by creating two attachment identities", async () => {
    const first = makeClient({
      sessionId: "11111111-1111-4111-8111-111111111111",
      spaceId: "22222222-2222-4222-8222-222222222222",
      slug: "alpha",
    });
    const second = makeClient({
      sessionId: "33333333-3333-4333-8333-333333333333",
      spaceId: "44444444-4444-4444-8444-444444444444",
      slug: "beta",
    });
    const clients = [first, second];
    createMcpServer({
      createClient: vi.fn(() => clients.shift() as never),
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const joinSpace = toolHandlers.get("join_space");
    expect(joinSpace).toBeDefined();
    const alpha = await joinSpace!({ slug: "alpha" }, {} as never);
    const beta = await joinSpace!({ slug: "beta" }, {} as never);

    expect(first.registerSession).toHaveBeenCalledOnce();
    expect(second.registerSession).toHaveBeenCalledOnce();
    expect(first.joinSpace).toHaveBeenCalledWith({
      slug: "alpha",
      idempotencyKey: expect.any(String),
    });
    expect(second.joinSpace).toHaveBeenCalledWith({
      slug: "beta",
      idempotencyKey: expect.any(String),
    });
    expect(alpha.content[0]?.text).toContain("11111111-1111-4111-8111-111111111111");
    expect(beta.content[0]?.text).toContain("33333333-3333-4333-8333-333333333333");
  });

  it("keeps Cursor and Claude MCP runtime state isolated for the same space", async () => {
    process.env.TALKIE_MCP_DISPLAY_NAME = "cursor";
    process.env.TALKIE_MCP_RUNTIME = "cursor-app";
    process.env.TALKIE_MCP_IS_HUMAN = "0";
    const cursorClient = makeClient({
      sessionId: "11111111-1111-4111-8111-111111111111",
      reconnectSecret: "cursor-secret",
      displayName: "cursor",
      slug: "shared-room",
    });
    createMcpServer({
      client: cursorClient as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const cursorJoin = await toolHandlers.get("join_space")!(
      { slug: "shared-room" },
      {} as never,
    );
    expect(cursorJoin.content[0]?.text).toContain(
      "11111111-1111-4111-8111-111111111111",
    );

    process.env.TALKIE_MCP_DISPLAY_NAME = "claude-code";
    process.env.TALKIE_MCP_RUNTIME = "claude-code";
    const claudeClient = makeClient({
      sessionId: "33333333-3333-4333-8333-333333333333",
      reconnectSecret: "claude-secret",
      displayName: "claude-code",
      slug: "shared-room",
      resume: vi.fn(async () => ({
        sessionId: "11111111-1111-4111-8111-111111111111",
        reconnectSecret: "cursor-secret",
      })),
    });
    createMcpServer({
      client: claudeClient as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const claudeJoin = await toolHandlers.get("join_space")!(
      { slug: "shared-room" },
      {} as never,
    );

    expect(claudeClient.resume).not.toHaveBeenCalled();
    expect(claudeClient.registerSession).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "claude-code",
        runtime: "claude-code",
        isHuman: false,
      }),
    );
    expect(claudeJoin.content[0]?.text).toContain(
      "33333333-3333-4333-8333-333333333333",
    );
  });

  it("stores inbox messages per joined attachment and supports filtered clear", async () => {
    let onEnvelopeHandler: ((env: Envelope) => void) | undefined;
    const client = makeClient();
    client.onEnvelope.mockImplementation((cb: (env: Envelope) => void) => {
      onEnvelopeHandler = cb;
    });
    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    await toolHandlers.get("join_space")!({ slug: "demo" }, {} as never);
    expect(onEnvelopeHandler).toBeDefined();
    onEnvelopeHandler!({
      version: 1,
      id: "33333333-3333-4333-8333-333333333333",
      sessionId: "44444444-4444-4444-8444-444444444444",
      kind: "conversation",
      type: "chat.message",
      payload: { text: "review this" },
      spaceId: "22222222-2222-4222-8222-222222222222",
      to: "11111111-1111-4111-8111-111111111111",
    });

    const inboxRead = resourceHandlers.get("session-inbox");
    expect(inboxRead).toBeDefined();
    const inboxResource = await inboxRead!(
      new URL("talkie://session/inbox"),
      {} as never,
    );
    expect(inboxResource.contents[0]?.text).toContain("review this");
    expect(
      statSync(join(dataDir, "adapter-cursor-mcp-inbox-state.json")).mode &
        0o777,
    ).toBe(0o600);

    const firstPull = await toolHandlers.get("pull_inbox")!(
      { slug: "demo", limit: 10 },
      {} as never,
    );
    expect(firstPull.content[0]?.text).toContain("review this");

    const clearPull = await toolHandlers.get("pull_inbox")!(
      { slug: "demo", clear: true },
      {} as never,
    );
    expect(clearPull.content[0]?.text).toContain("\"count\":1");

    const secondPull = await toolHandlers.get("pull_inbox")!(
      { slug: "demo", limit: 10 },
      {} as never,
    );
    expect(secondPull.content[0]?.text).toContain("\"count\":0");
  });

  it("pull_inbox catches up messages sent while the MCP runtime was offline", async () => {
    const dbPath = join(dataDir, "relay.sqlite");
    const db = openDatabase(dbPath);
    migrate(db);
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "offline-room",
      label: "Offline Room",
      nowMs: Date.now(),
    });
    db.close();

    const firstClient = makeClient({
      sessionId: "019df3c7-17da-76fa-a942-a0ebf2924153",
      reconnectSecret: "first-secret",
      displayName: "claude-code",
      spaceId,
      slug: "offline-room",
    });
    createMcpServer({
      dbPath,
      client: firstClient as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });
    await toolHandlers.get("join_space")!(
      { slug: "offline-room", name: "claude-code", runtime: "claude-code" },
      {} as never,
    );

    const writeDb = openDatabase(dbPath);
    createSession(writeDb, {
      displayName: "codex-cli",
      runtime: "codex-cli",
      workspaceLabel: "repo",
      isHuman: false,
    }, {
      id: "019df3c7-2000-7000-8000-000000000001",
    });
    appendTranscriptEntry(writeDb, {
      spaceId,
      senderSessionId: "019df3c7-2000-7000-8000-000000000001",
      envelopeJson: JSON.stringify({
        version: 1,
        id: "019df3c7-2000-7000-8000-000000000002",
        sessionId: "019df3c7-2000-7000-8000-000000000001",
        kind: "conversation",
        type: "chat.message",
        payload: { text: "offline direct" },
        spaceId,
        to: "019df3c7-17da-76fa-a942-a0ebf2924153",
      }),
      kind: "conversation",
      nowMs: Date.now(),
    });
    writeDb.close();

    toolHandlers.clear();
    resourceHandlers.clear();
    registeredToolNames.length = 0;
    const secondClient = makeClient({
      sessionId: "019df3c7-17da-76fa-a942-a0ebf2924153",
      reconnectSecret: "rotated-secret",
      displayName: "claude-code",
      spaceId,
      slug: "offline-room",
      resume: vi.fn(async () => ({
        sessionId: "019df3c7-17da-76fa-a942-a0ebf2924153",
        reconnectSecret: "rotated-secret",
      })),
    });
    createMcpServer({
      dbPath,
      client: secondClient as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const firstPull = await toolHandlers.get("pull_inbox")!(
      { slug: "offline-room", clear: true },
      {} as never,
    );
    expect(firstPull.content[0]?.text).toContain("offline direct");
    expect(firstPull.content[0]?.text).toContain("\"count\":1");

    const secondPull = await toolHandlers.get("pull_inbox")!(
      { slug: "offline-room", clear: true },
      {} as never,
    );
    expect(secondPull.content[0]?.text).toContain("\"count\":0");
  });

  it("transcript catch-up delivers dashboard orchestrator messages only to their effective target", async () => {
    const dbPath = join(dataDir, "relay.sqlite");
    const db = openDatabase(dbPath);
    migrate(db);
    const now = Date.now();
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "orchestrator-room",
      label: "Orchestrator Room",
      nowMs: now,
    });
    const humanId = "019df3c7-3000-7000-8000-000000000001";
    const orchestratorId = "019df3c7-3000-7000-8000-000000000002";
    const workerId = "019df3c7-3000-7000-8000-000000000003";
    createSession(
      db,
      {
        displayName: "human",
        runtime: "dashboard",
        workspaceLabel: "browser",
        isHuman: true,
      },
      { id: humanId },
    );
    createSession(
      db,
      {
        displayName: "claude-code",
        runtime: "claude-code",
        workspaceLabel: "repo",
      },
      { id: orchestratorId },
    );
    createSession(
      db,
      {
        displayName: "cursor",
        runtime: "cursor-app",
        workspaceLabel: "repo",
      },
      { id: workerId },
    );
    insertMembership(db, { spaceId, sessionId: humanId, nowMs: now });
    insertMembership(db, { spaceId, sessionId: orchestratorId, nowMs: now });
    insertMembership(db, { spaceId, sessionId: workerId, nowMs: now });
    setOrchestratorSessionId(db, spaceId, orchestratorId, now);
    appendTranscriptEntry(db, {
      spaceId,
      senderSessionId: humanId,
      envelopeJson: JSON.stringify({
        version: 1,
        id: "019df3c7-3000-7000-8000-000000000004",
        sessionId: humanId,
        kind: "conversation",
        type: "chat.message",
        payload: { text: "orchestrator-only" },
        spaceId,
        effectiveTo: orchestratorId,
      }),
      kind: "conversation",
      nowMs: now,
    });
    db.close();

    writeFileSync(
      join(dataDir, "adapter-cursor-mcp-session-state.json"),
      stateForAttachment({
        slug: "orchestrator-room",
        spaceId,
        sessionId: workerId,
        displayName: "cursor",
        runtime: "cursor-app",
      }),
      "utf8",
    );
    createMcpServer({
      dbPath,
      client: makeClient({
        sessionId: workerId,
        displayName: "cursor",
        spaceId,
        slug: "orchestrator-room",
        resume: vi.fn(async () => ({
          sessionId: workerId,
          reconnectSecret: "worker-secret",
        })),
      }) as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });
    const workerPull = await toolHandlers.get("pull_inbox")!(
      { slug: "orchestrator-room", clear: true },
      {} as never,
    );
    expect(workerPull.content[0]?.text).toContain("\"count\":0");

    toolHandlers.clear();
    resourceHandlers.clear();
    registeredToolNames.length = 0;
    writeFileSync(
      join(dataDir, "adapter-cursor-mcp-session-state.json"),
      stateForAttachment({
        slug: "orchestrator-room",
        spaceId,
        sessionId: orchestratorId,
        displayName: "claude-code",
        runtime: "claude-code",
      }),
      "utf8",
    );
    createMcpServer({
      dbPath,
      client: makeClient({
        sessionId: orchestratorId,
        displayName: "claude-code",
        spaceId,
        slug: "orchestrator-room",
        resume: vi.fn(async () => ({
          sessionId: orchestratorId,
          reconnectSecret: "orchestrator-secret",
        })),
      }) as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });
    const orchestratorPull = await toolHandlers.get("pull_inbox")!(
      { slug: "orchestrator-room", clear: true },
      {} as never,
    );
    expect(orchestratorPull.content[0]?.text).toContain("\"count\":1");
    expect(orchestratorPull.content[0]?.text).toContain("orchestrator-only");
  });

  it("session inbox resource catches up offline transcript messages before returning", async () => {
    const dbPath = join(dataDir, "relay.sqlite");
    const db = openDatabase(dbPath);
    migrate(db);
    const now = Date.now();
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "resource-room",
      label: "Resource Room",
      nowMs: now,
    });
    const receiverId = "019df3c7-4000-7000-8000-000000000001";
    const senderId = "019df3c7-4000-7000-8000-000000000002";
    createSession(
      db,
      {
        displayName: "receiver",
        runtime: "claude-code",
        workspaceLabel: "repo",
      },
      { id: receiverId },
    );
    createSession(
      db,
      {
        displayName: "sender",
        runtime: "codex-cli",
        workspaceLabel: "repo",
      },
      { id: senderId },
    );
    insertMembership(db, { spaceId, sessionId: receiverId, nowMs: now });
    insertMembership(db, { spaceId, sessionId: senderId, nowMs: now });
    appendTranscriptEntry(db, {
      spaceId,
      senderSessionId: senderId,
      envelopeJson: JSON.stringify({
        version: 1,
        id: "019df3c7-4000-7000-8000-000000000003",
        sessionId: senderId,
        kind: "conversation",
        type: "chat.message",
        payload: { text: "resource catch-up" },
        spaceId,
        to: receiverId,
      }),
      kind: "conversation",
      nowMs: now,
    });
    db.close();
    writeFileSync(
      join(dataDir, "adapter-cursor-mcp-session-state.json"),
      stateForAttachment({
        slug: "resource-room",
        spaceId,
        sessionId: receiverId,
        displayName: "receiver",
        runtime: "claude-code",
      }),
      "utf8",
    );

    createMcpServer({
      dbPath,
      client: makeClient({
        sessionId: receiverId,
        displayName: "receiver",
        spaceId,
        slug: "resource-room",
        resume: vi.fn(async () => ({
          sessionId: receiverId,
          reconnectSecret: "receiver-secret",
        })),
      }) as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const inboxRead = resourceHandlers.get("session-inbox");
    expect(inboxRead).toBeDefined();
    const inboxResource = await inboxRead!(
      new URL("talkie://session/inbox"),
      {} as never,
    );
    expect(inboxResource.contents[0]?.text).toContain("\"count\":1");
    expect(inboxResource.contents[0]?.text).toContain("resource catch-up");
  });

  it("malformed transcript rows do not crash pull_inbox catch-up", async () => {
    const dbPath = join(dataDir, "relay.sqlite");
    const db = openDatabase(dbPath);
    migrate(db);
    const now = Date.now();
    const { id: spaceId } = insertSpaceWithSlug(db, {
      slug: "malformed-room",
      label: "Malformed Room",
      nowMs: now,
    });
    const receiverId = "019df3c7-5000-7000-8000-000000000001";
    createSession(
      db,
      {
        displayName: "receiver",
        runtime: "claude-code",
        workspaceLabel: "repo",
      },
      { id: receiverId },
    );
    insertMembership(db, { spaceId, sessionId: receiverId, nowMs: now });
    appendTranscriptEntry(db, {
      spaceId,
      senderSessionId: receiverId,
      envelopeJson: "{not json",
      kind: "conversation",
      nowMs: now,
    });
    db.close();
    writeFileSync(
      join(dataDir, "adapter-cursor-mcp-session-state.json"),
      stateForAttachment({
        slug: "malformed-room",
        spaceId,
        sessionId: receiverId,
        displayName: "receiver",
        runtime: "claude-code",
      }),
      "utf8",
    );

    createMcpServer({
      dbPath,
      client: makeClient({
        sessionId: receiverId,
        displayName: "receiver",
        spaceId,
        slug: "malformed-room",
        resume: vi.fn(async () => ({
          sessionId: receiverId,
          reconnectSecret: "receiver-secret",
        })),
      }) as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const result = await toolHandlers.get("pull_inbox")!(
      { slug: "malformed-room", clear: true },
      {} as never,
    );
    expect(result.content[0]?.text).toContain("\"count\":0");
  });

  it("send_message by spaceId requires a known joined attachment", async () => {
    const client = makeClient();
    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const sendMessage = toolHandlers.get("send_message");
    expect(sendMessage).toBeDefined();
    const rejected = await sendMessage!(
      {
        spaceId: "22222222-2222-4222-8222-222222222222",
        text: "hello",
      },
      {} as never,
    );
    expect(rejected.isError).toBe(true);
    expect(client.sendEnvelope).not.toHaveBeenCalled();

    await toolHandlers.get("join_space")!({ slug: "demo" }, {} as never);
    const accepted = await sendMessage!(
      {
        spaceId: "22222222-2222-4222-8222-222222222222",
        text: "hello",
      },
      {} as never,
    );
    expect(accepted.content[0]?.text).toContain("\"ok\":true");
    expect(client.sendEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "11111111-1111-4111-8111-111111111111",
        spaceId: "22222222-2222-4222-8222-222222222222",
        payload: { text: "hello" },
      }),
    );
  });

  it("replaces a persisted attachment when resume joins a different active space", async () => {
    writeFileSync(
      join(dataDir, "adapter-cursor-mcp-session-state.json"),
      stateForAttachment(),
      "utf8",
    );
    const client = makeClient({
      sessionId: "33333333-3333-4333-8333-333333333333",
      resume: vi.fn(async () => ({
        sessionId: "11111111-1111-4111-8111-111111111111",
        reconnectSecret: "rotated-secret",
      })),
      joinSpace: vi
        .fn()
        .mockRejectedValueOnce(new Error('{"error":"already_in_space"}'))
        .mockResolvedValueOnce({
          spaceId: "22222222-2222-4222-8222-222222222222",
          slug: "demo",
        }),
    });

    createMcpServer({
      client: client as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const result = await toolHandlers.get("join_space")!(
      { slug: "demo" },
      {} as never,
    );

    expect(result.content[0]?.text).toContain("\"ok\":true");
    expect(client.resume).toHaveBeenCalledOnce();
    expect(client.registerSession).toHaveBeenCalledOnce();
    expect(client.joinSpace).toHaveBeenCalledTimes(2);
    expect(client.close).toHaveBeenCalledOnce();
  });
});
