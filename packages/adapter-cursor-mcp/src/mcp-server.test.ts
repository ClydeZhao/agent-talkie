import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpServer } from "./mcp-server.js";

describe("createMcpServer", () => {
  const registeredToolNames: string[] = [];
  const toolHandlers = new Map<
    string,
    Parameters<McpServer["registerTool"]>[2]
  >();
  let originalRegisterTool: McpServer["registerTool"];
  let dataDir: string;

  beforeEach(() => {
    registeredToolNames.length = 0;
    toolHandlers.clear();
    dataDir = mkdtempSync(join(tmpdir(), "talkie-cursor-mcp-"));
    process.env.AGENT_TALKIE_DATA_DIR = dataDir;
    originalRegisterTool = McpServer.prototype.registerTool;
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
  });

  afterEach(() => {
    delete process.env.AGENT_TALKIE_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("registers tools join_space, send_message, assign_orchestrator, update_metadata", () => {
    createMcpServer({
      client: {} as never,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });
    expect(registeredToolNames).toContain("join_space");
    expect(registeredToolNames).toContain("send_message");
    expect(registeredToolNames).toContain("assign_orchestrator");
    expect(registeredToolNames).toContain("update_metadata");
  });

  it("resumes persisted session credentials before join_space", async () => {
    writeFileSync(
      join(dataDir, "adapter-cursor-mcp-session-state.json"),
      JSON.stringify({
        sessionId: "11111111-1111-4111-8111-111111111111",
        reconnectSecret: "stored-secret",
      }),
      "utf8",
    );
    const client = {
      connect: vi.fn(async () => {}),
      registerSession: vi.fn(async () => ({
        sessionId: "new-session",
        reconnectSecret: "new-secret",
        displayName: "cursor",
      })),
      resume: vi.fn(async () => ({
        sessionId: "11111111-1111-4111-8111-111111111111",
        reconnectSecret: "rotated-secret",
      })),
      joinSpace: vi.fn(async () => ({
        spaceId: "22222222-2222-4222-8222-222222222222",
        slug: "demo",
      })),
      sendEnvelope: vi.fn(),
      onEnvelope: vi.fn(),
      close: vi.fn(),
    } as never;

    createMcpServer({
      client,
      ensureRelay: async () => ({ port: 18765, generation: "g", pid: 1, spawned: false }),
    });

    const joinSpace = toolHandlers.get("join_space");
    expect(joinSpace).toBeDefined();
    await joinSpace!({ slug: "demo" }, {} as never);

    expect((client as never as { resume: ReturnType<typeof vi.fn> }).resume).toHaveBeenCalledWith({
      sessionId: "11111111-1111-4111-8111-111111111111",
      reconnectSecret: "stored-secret",
    });
    expect(
      (client as never as { registerSession: ReturnType<typeof vi.fn> }).registerSession,
    ).not.toHaveBeenCalled();
    expect(
      (client as never as { joinSpace: ReturnType<typeof vi.fn> }).joinSpace,
    ).toHaveBeenCalled();
  });
});
