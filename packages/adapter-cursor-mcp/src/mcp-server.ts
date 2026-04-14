import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TalkieSessionClient } from "@agent-talkie/client";
import {
  getCollaborationMetadataSnapshot,
  getOversightSpaceSummaryBySlug,
  getSpaceBySlug,
  listOversightBlockedSessionsBySlug,
  listOversightTranscriptTailBySlug,
  openDatabase,
} from "@agent-talkie/persistence";
import { metadataPatchPayloadSchema } from "@agent-talkie/protocol";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ensureRelayRunning,
  resolveAgentTalkieDataDir,
} from "@agent-talkie/supervisor";
import { z } from "zod";

export const DEFAULT_TIMELINE_LIMIT = 50;

export type CreateMcpServerDeps = {
  dbPath?: string;
  client?: TalkieSessionClient;
  ensureRelay?: typeof ensureRelayRunning;
};

function validationError(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: `validation_error: ${message}` }],
    isError: true,
  };
}

function resolveDbPath(deps?: CreateMcpServerDeps): string {
  return deps?.dbPath ?? join(resolveAgentTalkieDataDir(), "relay.sqlite");
}

function templateVarSlug(value: string | string[] | undefined): string {
  if (value === undefined) {
    return "";
  }
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

export function createMcpServer(deps?: CreateMcpServerDeps): McpServer {
  const slugToSpaceId = new Map<string, string>();
  let sessionPromise: Promise<{
    client: TalkieSessionClient;
    sessionId: string;
  }> | null = null;

  const ensureRelay = deps?.ensureRelay ?? ensureRelayRunning;

  function ensureSession(): Promise<{
    client: TalkieSessionClient;
    sessionId: string;
  }> {
    if (!sessionPromise) {
      sessionPromise = (async () => {
        let client = deps?.client;
        if (!client) {
          const relay = await ensureRelay({});
          client = new TalkieSessionClient({
            url: `ws://127.0.0.1:${relay.port}`,
          });
        }
        await client.connect();
        const reg = await client.registerSession({
          displayName: process.env.TALKIE_MCP_DISPLAY_NAME ?? "cursor-mcp-adapter",
          runtime: process.env.TALKIE_MCP_RUNTIME ?? "adapter-cursor-mcp",
          workspaceLabel: process.env.TALKIE_MCP_WORKSPACE ?? ".",
          isHuman: process.env.TALKIE_MCP_IS_HUMAN === "0" ? false : true,
        });
        return { client, sessionId: reg.sessionId };
      })();
    }
    return sessionPromise;
  }

  const mcp = new McpServer(
    { name: "agent-talkie-cursor-mcp", version: "0.0.0" },
    {},
  );

  const joinSpaceInput = z.object({ slug: z.string().min(1).max(64) });
  const sendMessageInput = z.object({
    spaceId: z.string().uuid(),
    text: z.string().min(1).max(8000),
    toSessionId: z.string().uuid().optional(),
  });
  const assignOrchestratorInput = z.object({
    spaceId: z.string().uuid(),
    orchestratorSessionId: z.string().uuid(),
  });
  const updateMetadataInput = z
    .object({
      spaceId: z.string().uuid(),
      namespace: z.enum(["profile", "status"]),
      targetSessionId: z.string().uuid().optional(),
      patch: z.record(z.string(), z.unknown()),
    })
    .superRefine((val, ctx) => {
      if (val.namespace === "status" && val.targetSessionId !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "targetSessionId is only valid for namespace profile",
        });
      }
    });

  mcp.registerTool(
    "join_space",
    {
      description: "Connect to the relay and join a space by slug.",
      inputSchema: z.any(),
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = joinSpaceInput.safeParse(raw);
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      const { slug } = parsed.data;
      const { client, sessionId } = await ensureSession();
      const { spaceId } = await client.joinSpace({
        slug,
        idempotencyKey: randomUUID(),
      });
      slugToSpaceId.set(slug, spaceId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              slug,
              spaceId,
              sessionId,
            }),
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "send_message",
    {
      description: "Send a conversation message in a space.",
      inputSchema: z.any(),
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = sendMessageInput.safeParse(raw);
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      const { spaceId, text, toSessionId } = parsed.data;
      const { client, sessionId } = await ensureSession();
      client.sendEnvelope({
        version: 1,
        id: randomUUID(),
        sessionId,
        kind: "conversation",
        type: "chat.message",
        spaceId,
        payload: { text },
        ...(toSessionId !== undefined ? { to: toSessionId } : {}),
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, spaceId }),
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "assign_orchestrator",
    {
      description: "Designate the orchestrator session for a space (owner-gated on relay).",
      inputSchema: z.any(),
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = assignOrchestratorInput.safeParse(raw);
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      const { spaceId, orchestratorSessionId } = parsed.data;
      const { client, sessionId } = await ensureSession();
      client.sendEnvelope({
        version: 1,
        id: randomUUID(),
        sessionId,
        kind: "control",
        type: "orchestrator.designate",
        spaceId,
        idempotencyKey: randomUUID(),
        payload: { orchestratorSessionId },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, spaceId, orchestratorSessionId }),
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "update_metadata",
    {
      description:
        "Patch collaboration profile or status metadata for a session. Self-reported fields may include blockedReason for native tooling blockers; use profile/status patches as appropriate.",
      inputSchema: z.any(),
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = updateMetadataInput.safeParse(raw);
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      const row = parsed.data;
      const payloadIn =
        row.namespace === "profile"
          ? {
              namespace: "profile" as const,
              ...(row.targetSessionId !== undefined
                ? { targetSessionId: row.targetSessionId }
                : {}),
              patch: row.patch,
            }
          : { namespace: "status" as const, patch: row.patch };

      const protocolPayload = metadataPatchPayloadSchema.safeParse(payloadIn);
      if (!protocolPayload.success) {
        return validationError(protocolPayload.error.message);
      }

      const { client, sessionId } = await ensureSession();
      client.sendEnvelope({
        version: 1,
        id: randomUUID(),
        sessionId,
        kind: "control",
        type: "metadata.patch",
        spaceId: row.spaceId,
        idempotencyKey: randomUUID(),
        payload: protocolPayload.data,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      };
    },
  );

  const resourceMeta = {
    description: "Read-only collaboration snapshot (explicit fetch; not auto-injected).",
  };

  const readJsonResource = (
    uri: URL,
    build: (db: ReturnType<typeof openDatabase>) => unknown,
  ): ReadResourceResult => {
    const dbPath = resolveDbPath(deps);
    if (!existsSync(dbPath)) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `Relay database not found at ${dbPath}. Run the relay once to create relay.sqlite.`,
          },
        ],
      };
    }
    let db: ReturnType<typeof openDatabase> | undefined;
    try {
      db = openDatabase(dbPath);
      const data = build(db);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data),
          },
        ],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: `Failed to read ${uri.href}: ${msg}`,
          },
        ],
      };
    } finally {
      db?.close();
    }
  };

  mcp.registerResource(
    "space-participants",
    new ResourceTemplate("talkie://space/{slug}/participants", {
      list: undefined,
    }),
    resourceMeta,
    (_uri, variables): ReadResourceResult => {
      const slug = templateVarSlug(variables.slug);
      return readJsonResource(_uri, (db) => {
        const summary = getOversightSpaceSummaryBySlug(db, slug);
        return summary ?? { error: "unknown_slug", slug };
      });
    },
  );

  mcp.registerResource(
    "space-timeline",
    new ResourceTemplate("talkie://space/{slug}/timeline", {
      list: undefined,
    }),
    resourceMeta,
    (_uri, variables): ReadResourceResult => {
      const slug = templateVarSlug(variables.slug);
      return readJsonResource(_uri, (db) => ({
        entries: listOversightTranscriptTailBySlug(db, {
          slug,
          limit: DEFAULT_TIMELINE_LIMIT,
        }),
      }));
    },
  );

  mcp.registerResource(
    "space-metadata",
    new ResourceTemplate("talkie://space/{slug}/metadata", {
      list: undefined,
    }),
    resourceMeta,
    (_uri, variables): ReadResourceResult => {
      const slug = templateVarSlug(variables.slug);
      return readJsonResource(_uri, (db) => {
        const space = getSpaceBySlug(db, slug);
        if (!space) {
          return { error: "unknown_slug", slug };
        }
        return getCollaborationMetadataSnapshot(db, space.id);
      });
    },
  );

  mcp.registerResource(
    "space-blocked",
    new ResourceTemplate("talkie://space/{slug}/blocked", {
      list: undefined,
    }),
    resourceMeta,
    (_uri, variables): ReadResourceResult => {
      const slug = templateVarSlug(variables.slug);
      return readJsonResource(_uri, (db) => ({
        blocked: listOversightBlockedSessionsBySlug(db, slug),
      }));
    },
  );

  return mcp;
}

export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const { StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  );
  await server.connect(new StdioServerTransport());
}
