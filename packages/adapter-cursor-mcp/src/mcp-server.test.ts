import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpServer } from "./mcp-server.js";

describe("createMcpServer", () => {
  const registeredToolNames: string[] = [];
  let originalRegisterTool: McpServer["registerTool"];

  beforeEach(() => {
    registeredToolNames.length = 0;
    originalRegisterTool = McpServer.prototype.registerTool;
    vi.spyOn(McpServer.prototype, "registerTool").mockImplementation(function (
      this: McpServer,
      name: string,
      ...rest: Parameters<McpServer["registerTool"]> extends [string, infer C, infer H]
        ? [C, H]
        : never
    ) {
      registeredToolNames.push(name);
      return originalRegisterTool.call(this, name, ...rest);
    });
  });

  afterEach(() => {
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
});
