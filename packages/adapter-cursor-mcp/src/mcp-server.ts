import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TalkieSessionClient } from "@agent-talkie/client";
import {
  getCollaborationMetadataSnapshot,
  getOversightSpaceSummaryBySlug,
  getSpaceBySlug,
  listOversightBlockedSessionsBySlug,
  listOversightTranscriptTailBySlug,
  migrate,
  normalizeSpaceSlug,
  openDatabase,
} from "@agent-talkie/persistence";
import {
  metadataPatchPayloadSchema,
  safeParseEnvelope,
  type Envelope,
} from "@agent-talkie/protocol";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ensureRelayRunning,
  resolveAgentTalkieDataDir,
} from "@agent-talkie/supervisor";
import { z } from "zod";

export const DEFAULT_TIMELINE_LIMIT = 50;
const CURSOR_MCP_SESSION_STATE_FILE = "adapter-cursor-mcp-session-state.json";
const CURSOR_MCP_INBOX_STATE_FILE = "adapter-cursor-mcp-inbox-state.json";
const SESSION_INBOX_URI = "talkie://session/inbox";
const SESSION_STATE_URI = "talkie://session/state";

type PersistedAttachmentState = {
  sessionId: string;
  reconnectSecret: string;
  slug: string;
  spaceId: string;
  displayName: string;
  runtime: string;
  workspaceLabel: string;
};

type PersistedMcpState = {
  attachments: Record<string, PersistedAttachmentState>;
};

type InboxItem = {
  receivedAtMs: number;
  slug: string;
  receiverSessionId: string;
  envelope: Envelope;
};

type InboxState = {
  items: InboxItem[];
};

export type CreateMcpServerDeps = {
  dbPath?: string;
  client?: TalkieSessionClient;
  createClient?: () => TalkieSessionClient;
  ensureRelay?: typeof ensureRelayRunning;
};

type Attachment = PersistedAttachmentState & {
  client: TalkieSessionClient;
};

function validationError(message: string): CallToolResult {
  return {
    content: [{ type: "text", text: `validation_error: ${message}` }],
    isError: true,
  };
}

function isAlreadyInSpaceError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("already_in_space");
}

function resolveDbPath(deps?: CreateMcpServerDeps): string {
  return deps?.dbPath ?? join(resolveAgentTalkieDataDir(), "relay.sqlite");
}

function resolveSessionStatePath(): string {
  return join(resolveAgentTalkieDataDir(), CURSOR_MCP_SESSION_STATE_FILE);
}

function resolveInboxStatePath(): string {
  return join(resolveAgentTalkieDataDir(), CURSOR_MCP_INBOX_STATE_FILE);
}

function loadPersistedMcpState(path: string): PersistedMcpState {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return { attachments: {} };
    }
    const attachments = (parsed as { attachments?: unknown }).attachments;
    if (typeof attachments !== "object" || attachments === null) {
      return { attachments: {} };
    }
    return {
      attachments: Object.fromEntries(
        Object.entries(attachments as Record<string, unknown>).flatMap(
          ([slug, value]) => {
            if (typeof value !== "object" || value === null) {
              return [];
            }
            const row = value as Partial<PersistedAttachmentState>;
            if (
              typeof row.sessionId !== "string" ||
              typeof row.reconnectSecret !== "string" ||
              typeof row.slug !== "string" ||
              typeof row.spaceId !== "string" ||
              typeof row.displayName !== "string" ||
              typeof row.runtime !== "string" ||
              typeof row.workspaceLabel !== "string"
            ) {
              return [];
            }
            return [
              [
                slug,
                {
                  sessionId: row.sessionId,
                  reconnectSecret: row.reconnectSecret,
                  slug: row.slug,
                  spaceId: row.spaceId,
                  displayName: row.displayName,
                  runtime: row.runtime,
                  workspaceLabel: row.workspaceLabel,
                },
              ],
            ];
          },
        ),
      ),
    };
  } catch {
    /* ignore */
  }
  return { attachments: {} };
}

function persistMcpState(path: string, state: PersistedMcpState): void {
  mkdirSync(resolveAgentTalkieDataDir(), { recursive: true });
  writeFileSync(path, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

function loadInboxState(path: string): InboxState {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { items?: unknown }).items)
    ) {
      return { items: [] };
    }
    const items = (parsed as { items: unknown[] }).items.flatMap((item) => {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as { receivedAtMs?: unknown }).receivedAtMs !== "number" ||
        typeof (item as { slug?: unknown }).slug !== "string" ||
        typeof (item as { receiverSessionId?: unknown }).receiverSessionId !==
          "string"
      ) {
        return [];
      }
      const parsedEnvelope = safeParseEnvelope(
        (item as { envelope?: unknown }).envelope,
      );
      if (!parsedEnvelope.success) {
        return [];
      }
      return [
        {
          receivedAtMs: (item as { receivedAtMs: number }).receivedAtMs,
          slug: (item as { slug: string }).slug,
          receiverSessionId: (item as { receiverSessionId: string })
            .receiverSessionId,
          envelope: parsedEnvelope.data,
        },
      ];
    });
    return { items };
  } catch {
    return { items: [] };
  }
}

function persistInboxState(path: string, state: InboxState): void {
  mkdirSync(resolveAgentTalkieDataDir(), { recursive: true });
  writeFileSync(path, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

function templateVarSlug(value: string | string[] | undefined): string {
  if (value === undefined) {
    return "";
  }
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function parseInputSlug(raw: string): string {
  return normalizeSpaceSlug(raw);
}

export function createMcpServer(deps?: CreateMcpServerDeps): McpServer {
  const statePath = resolveSessionStatePath();
  let persistedState = loadPersistedMcpState(statePath);
  const attachmentsBySlug = new Map<string, Promise<Attachment>>();
  const inboxStatePath = resolveInboxStatePath();
  let inboxState = loadInboxState(inboxStatePath);
  const ensureRelay = deps?.ensureRelay ?? ensureRelayRunning;
  let relayPromise: ReturnType<typeof ensureRelay> | null = null;

  const mcp = new McpServer(
    { name: "agent-talkie-cursor-mcp", version: "0.0.0" },
    {
      capabilities: {
        resources: {
          subscribe: true,
          listChanged: true,
        },
      },
    },
  );

  function persistInbox(): void {
    persistInboxState(inboxStatePath, inboxState);
  }

  function persistState(): void {
    persistMcpState(statePath, persistedState);
  }

  function notifySessionResourcesUpdated(): void {
    void mcp.server.sendResourceUpdated({ uri: SESSION_INBOX_URI }).catch(() => {
      /* ignore when Cursor has not connected yet */
    });
    void mcp.server.sendResourceUpdated({ uri: SESSION_STATE_URI }).catch(() => {
      /* ignore when Cursor has not connected yet */
    });
  }

  function pushInboxEnvelope(args: {
    slug: string;
    receiverSessionId: string;
    envelope: Envelope;
  }): void {
    const { slug, receiverSessionId, envelope } = args;
    if (inboxState.items.some((item) => item.envelope.id === envelope.id)) {
      return;
    }
    inboxState = {
      items: [
        ...inboxState.items,
        { receivedAtMs: Date.now(), slug, receiverSessionId, envelope },
      ],
    };
    persistInbox();
    notifySessionResourcesUpdated();
  }

  function pullInbox(args: {
    slug?: string;
    limit: number;
    clear: boolean;
  }): InboxItem[] {
    const eligible = args.slug
      ? inboxState.items.filter((item) => item.slug === args.slug)
      : inboxState.items;
    const items = eligible.slice(0, args.limit);
    if (args.clear && items.length > 0) {
      const ids = new Set(items.map((item) => item.envelope.id));
      inboxState = {
        items: inboxState.items.filter((item) => !ids.has(item.envelope.id)),
      };
      persistInbox();
      notifySessionResourcesUpdated();
    }
    return items;
  }

  function resolveSpaceIdFromInput(input: {
    spaceId?: string;
    slug?: string;
  }): string | undefined {
    if (input.spaceId) {
      return input.spaceId;
    }
    if (!input.slug) {
      return undefined;
    }
    const known = persistedState.attachments[input.slug];
    if (known) {
      return known.spaceId;
    }
    const dbPath = resolveDbPath(deps);
    if (!existsSync(dbPath)) {
      return undefined;
    }
    const db = openDatabase(dbPath);
    try {
      migrate(db);
      const space = getSpaceBySlug(db, input.slug);
      if (!space) {
        return undefined;
      }
      return space.id;
    } finally {
      db.close();
    }
  }

  function identityForAttachment(args: {
    persisted?: PersistedAttachmentState;
    name?: string;
    runtime?: string;
    workspace?: string;
  }): {
    displayName: string;
    runtime: string;
    workspaceLabel: string;
    isHuman: boolean;
  } {
    return {
      displayName:
        args.name ??
        args.persisted?.displayName ??
        process.env.TALKIE_MCP_DISPLAY_NAME ??
        "cursor-mcp-adapter",
      runtime:
        args.runtime ??
        args.persisted?.runtime ??
        process.env.TALKIE_MCP_RUNTIME ??
        "adapter-cursor-mcp",
      workspaceLabel:
        args.workspace ??
        args.persisted?.workspaceLabel ??
        process.env.TALKIE_MCP_WORKSPACE ??
        ".",
      isHuman: process.env.TALKIE_MCP_IS_HUMAN === "0" ? false : true,
    };
  }

  async function connectClient(): Promise<TalkieSessionClient> {
    const client =
      deps?.createClient?.() ??
      deps?.client ??
      new TalkieSessionClient({
        url: `ws://127.0.0.1:${(await (relayPromise ??= ensureRelay({}))).port}`,
      });
    await client.connect();
    return client;
  }

  async function registerAttachment(args: {
    client: TalkieSessionClient;
    name?: string;
    runtime?: string;
    workspace?: string;
    persisted?: PersistedAttachmentState;
  }): Promise<{
    sessionId: string;
    reconnectSecret: string;
    displayName: string;
    runtime: string;
    workspaceLabel: string;
  }> {
    const identity = identityForAttachment({
      persisted: args.persisted,
      name: args.name,
      runtime: args.runtime,
      workspace: args.workspace,
    });
    const registered = await args.client.registerSession(identity);
    return {
      sessionId: registered.sessionId,
      reconnectSecret: registered.reconnectSecret,
      displayName: registered.displayName,
      runtime: identity.runtime,
      workspaceLabel: identity.workspaceLabel,
    };
  }

  function hasKnownAttachment(slug: string): boolean {
    return (
      attachmentsBySlug.has(slug) ||
      persistedState.attachments[slug] !== undefined
    );
  }

  function findSlugBySpaceId(spaceId: string): string | undefined {
    for (const [slug, attachment] of Object.entries(persistedState.attachments)) {
      if (attachment.spaceId === spaceId) {
        return slug;
      }
    }
    return undefined;
  }

  async function ensureAttachment(args: {
    slug: string;
    createIfMissing: boolean;
    name?: string;
    runtime?: string;
    workspace?: string;
  }): Promise<Attachment> {
    const existing = attachmentsBySlug.get(args.slug);
    if (existing) {
      return existing;
    }

    const persisted = persistedState.attachments[args.slug];
    if (!persisted && !args.createIfMissing) {
      throw new Error(`not_joined:${args.slug}`);
    }

    const promise = (async (): Promise<Attachment> => {
      let client = await connectClient();
      let session:
        | {
            sessionId: string;
            reconnectSecret: string;
            displayName: string;
            runtime: string;
            workspaceLabel: string;
          }
        | undefined;

      if (persisted) {
        try {
          const resumed = await client.resume({
            sessionId: persisted.sessionId,
            reconnectSecret: persisted.reconnectSecret,
          });
          session = {
            sessionId: resumed.sessionId,
            reconnectSecret: resumed.reconnectSecret,
            displayName: persisted.displayName,
            runtime: persisted.runtime,
            workspaceLabel: persisted.workspaceLabel,
          };
        } catch {
          client.close();
          client = await connectClient();
        }
      }

      if (!session) {
        session = await registerAttachment({
          client,
          name: args.name,
          runtime: args.runtime,
          workspace: args.workspace,
          persisted,
        });
      }

      let currentSlug = args.slug;
      client.onEnvelope((envelope) => {
        if (envelope.sessionId === session?.sessionId) {
          return;
        }
        if (!session) {
          return;
        }
        pushInboxEnvelope({
          slug: currentSlug,
          receiverSessionId: session.sessionId,
          envelope,
        });
      });

      let joined: { spaceId: string; slug: string };
      try {
        joined = await client.joinSpace({
          slug: args.slug,
          idempotencyKey: randomUUID(),
        });
      } catch (error) {
        if (!persisted || !isAlreadyInSpaceError(error)) {
          throw error;
        }
        client.close();
        client = await connectClient();
        session = await registerAttachment({
          client,
          name: args.name,
          runtime: args.runtime,
          workspace: args.workspace,
          persisted,
        });
        client.onEnvelope((envelope) => {
          if (envelope.sessionId === session?.sessionId) {
            return;
          }
          if (!session) {
            return;
          }
          pushInboxEnvelope({
            slug: currentSlug,
            receiverSessionId: session.sessionId,
            envelope,
          });
        });
        joined = await client.joinSpace({
          slug: args.slug,
          idempotencyKey: randomUUID(),
        });
      }

      currentSlug = joined.slug;
      const attachment: Attachment = {
        client,
        sessionId: session.sessionId,
        reconnectSecret: session.reconnectSecret,
        slug: joined.slug,
        spaceId: joined.spaceId,
        displayName: session.displayName,
        runtime: session.runtime,
        workspaceLabel: session.workspaceLabel,
      };
      if (joined.slug !== args.slug) {
        delete persistedState.attachments[args.slug];
        attachmentsBySlug.delete(args.slug);
      }
      persistedState.attachments[joined.slug] = {
        sessionId: attachment.sessionId,
        reconnectSecret: attachment.reconnectSecret,
        slug: attachment.slug,
        spaceId: attachment.spaceId,
        displayName: attachment.displayName,
        runtime: attachment.runtime,
        workspaceLabel: attachment.workspaceLabel,
      };
      persistState();
      attachmentsBySlug.set(joined.slug, Promise.resolve(attachment));
      notifySessionResourcesUpdated();
      return attachment;
    })().catch((error: unknown) => {
      attachmentsBySlug.delete(args.slug);
      if (persisted === undefined) {
        delete persistedState.attachments[args.slug];
        persistState();
      }
      throw error;
    });
    attachmentsBySlug.set(args.slug, promise);
    return promise;
  }

  async function ensureKnownAttachments(): Promise<void> {
    await Promise.all(
      Object.keys(persistedState.attachments).map(async (slug) => {
        await ensureAttachment({ slug, createIfMissing: false });
      }),
    );
  }

  async function ensureAttachmentBySpaceId(
    spaceId: string,
  ): Promise<Attachment | undefined> {
    const slug = findSlugBySpaceId(spaceId);
    if (!slug) {
      return undefined;
    }
    return ensureAttachment({ slug, createIfMissing: false });
  }

  const joinSpaceInput = z.object({
    slug: z.string().min(1).max(64),
    name: z.string().min(1).max(128).optional(),
    runtime: z.string().min(1).max(64).optional(),
    workspace: z.string().min(1).max(256).optional(),
  });
  const sendMessageInput = z
    .object({
      spaceId: z.string().uuid().optional(),
      slug: z.string().min(1).max(64).optional(),
      text: z.string().min(1).max(8000),
      toSessionId: z.string().uuid().optional(),
    })
    .refine((value) => value.spaceId !== undefined || value.slug !== undefined, {
      message: "spaceId or slug is required",
      path: ["spaceId"],
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
  const pullInboxInput = z.object({
    slug: z.string().min(1).max(64).optional(),
    clear: z.boolean().optional(),
    limit: z.number().int().positive().max(100).optional(),
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
      let slug: string;
      try {
        slug = parseInputSlug(parsed.data.slug);
      } catch {
        return validationError("invalid slug");
      }
      const attachment = await ensureAttachment({
        slug,
        createIfMissing: true,
        name: parsed.data.name,
        runtime: parsed.data.runtime,
        workspace: parsed.data.workspace,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              slug: attachment.slug,
              spaceId: attachment.spaceId,
              sessionId: attachment.sessionId,
              displayName: attachment.displayName,
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
      let attachment: Attachment | undefined;
      if (parsed.data.slug !== undefined) {
        let slug: string;
        try {
          slug = parseInputSlug(parsed.data.slug);
        } catch {
          return validationError("invalid slug");
        }
        if (!hasKnownAttachment(slug)) {
          return validationError(
            `current Cursor MCP session has not joined space ${slug}`,
          );
        }
        attachment = await ensureAttachment({
          slug,
          createIfMissing: false,
        });
      } else {
        const spaceId = resolveSpaceIdFromInput(parsed.data);
        if (!spaceId) {
          return validationError("unknown spaceId/slug");
        }
        attachment = await ensureAttachmentBySpaceId(spaceId);
        if (!attachment) {
          return validationError(
            "current Cursor MCP session has not joined the requested space",
          );
        }
      }
      attachment.client.sendEnvelope({
        version: 1,
        id: randomUUID(),
        sessionId: attachment.sessionId,
        kind: "conversation",
        type: "chat.message",
        spaceId: attachment.spaceId,
        payload: { text: parsed.data.text },
        ...(parsed.data.toSessionId !== undefined
          ? { to: parsed.data.toSessionId }
          : {}),
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              slug: attachment.slug,
              spaceId: attachment.spaceId,
              sessionId: attachment.sessionId,
            }),
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
      const attachment = await ensureAttachmentBySpaceId(parsed.data.spaceId);
      if (!attachment) {
        return validationError(
          "current Cursor MCP session has not joined the requested space",
        );
      }
      attachment.client.sendEnvelope({
        version: 1,
        id: randomUUID(),
        sessionId: attachment.sessionId,
        kind: "control",
        type: "orchestrator.designate",
        spaceId: parsed.data.spaceId,
        idempotencyKey: randomUUID(),
        payload: { orchestratorSessionId: parsed.data.orchestratorSessionId },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              spaceId: parsed.data.spaceId,
              orchestratorSessionId: parsed.data.orchestratorSessionId,
            }),
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

      const attachment = await ensureAttachmentBySpaceId(row.spaceId);
      if (!attachment) {
        return validationError(
          "current Cursor MCP session has not joined the requested space",
        );
      }
      attachment.client.sendEnvelope({
        version: 1,
        id: randomUUID(),
        sessionId: attachment.sessionId,
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

  mcp.registerTool(
    "pull_inbox",
    {
      description:
        "Return pending inbound Talkie envelopes for this Cursor session. Use clear=true to acknowledge the returned items.",
      inputSchema: z.any(),
    },
    async (raw: unknown): Promise<CallToolResult> => {
      const parsed = pullInboxInput.safeParse(raw ?? {});
      if (!parsed.success) {
        return validationError(parsed.error.message);
      }
      if (parsed.data.slug !== undefined) {
        let slug: string;
        try {
          slug = parseInputSlug(parsed.data.slug);
        } catch {
          return validationError("invalid slug");
        }
        if (!hasKnownAttachment(slug)) {
          return validationError(
            `current Cursor MCP session has not joined space ${slug}`,
          );
        }
        await ensureAttachment({
          slug,
          createIfMissing: false,
        });
        parsed.data.slug = slug;
      } else {
        await ensureKnownAttachments();
      }
      const items = pullInbox({
        slug: parsed.data.slug,
        limit: parsed.data.limit ?? 20,
        clear: parsed.data.clear === true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              count: items.length,
              items,
            }),
          },
        ],
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
      migrate(db);
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
    "session-inbox",
    SESSION_INBOX_URI,
    {
      description: "Pending inbound Talkie envelopes for this Cursor session.",
      mimeType: "application/json",
    },
    async (): Promise<ReadResourceResult> => {
      await ensureKnownAttachments();
      return {
        contents: [
          {
            uri: SESSION_INBOX_URI,
            mimeType: "application/json",
            text: JSON.stringify({
              count: inboxState.items.length,
              items: inboxState.items,
            }),
          },
        ],
      };
    },
  );

  mcp.registerResource(
    "session-state",
    SESSION_STATE_URI,
    {
      description: "Cursor Talkie session state, joined slugs, and pending inbox count.",
      mimeType: "application/json",
    },
    async (): Promise<ReadResourceResult> => {
      const attachments = Object.values(persistedState.attachments);
      return {
        contents: [
          {
            uri: SESSION_STATE_URI,
            mimeType: "application/json",
            text: JSON.stringify({
              attachments,
              joinedSlugs: attachments.map((attachment) => attachment.slug),
              joinedSpaces: Object.fromEntries(
                attachments.map((attachment) => [
                  attachment.slug,
                  attachment.spaceId,
                ]),
              ),
              pendingInboxCount: inboxState.items.length,
            }),
          },
        ],
      };
    },
  );

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

function isMainModule(): boolean {
  const entry = fileURLToPath(import.meta.url);
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  try {
    return realpathSync(resolve(argv1)) === realpathSync(resolve(entry));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void runMcpServer().catch((err) => {
    process.stderr.write(
      `[talkie-cursor-mcp] ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  });
}
