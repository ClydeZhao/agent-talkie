import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
        runtime: "adapter-cursor-mcp",
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
    rmSync(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("registers tools join_space, send_message, assign_orchestrator, update_metadata, pull_inbox", () => {
    createMcpServer({
      client: makeClient() as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });
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
      "current Cursor MCP session has not joined space demo",
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
