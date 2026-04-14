import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const DEFAULT_TIMELINE_LIMIT = 50;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function createMcpServer(_deps?: Record<string, unknown>): McpServer {
  return new McpServer({ name: "agent-talkie-cursor-mcp", version: "0.0.0" }, {});
}

export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  await server.connect(new StdioServerTransport());
}
